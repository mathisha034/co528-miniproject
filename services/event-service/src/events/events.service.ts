import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  EventEntity,
  EventDocument,
  EventStatus,
} from './schemas/event.schema';
import { CreateEventDto, UpdateEventStatusDto } from './dto/event.dto';

// Valid status transitions: upcoming → live → ended (strict forward-only)
const EVENT_TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  [EventStatus.UPCOMING]: [EventStatus.LIVE],
  [EventStatus.LIVE]: [EventStatus.ENDED],
  [EventStatus.ENDED]: [],
};

@Injectable()
export class EventsService {
  constructor(
    @InjectModel(EventEntity.name) private eventModel: Model<EventDocument>,
  ) {}

  async create(createdBy: string, dto: CreateEventDto): Promise<EventDocument> {
    return this.eventModel.create({
      createdBy: new Types.ObjectId(createdBy),
      ...dto,
      eventDate: new Date(dto.eventDate),
    });
  }

  async findAll(): Promise<EventDocument[]> {
    return this.eventModel.find().sort({ eventDate: 1 }).exec();
  }

  async findById(id: string): Promise<EventDocument> {
    const event = await this.eventModel.findById(id);
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  async updateStatus(
    id: string,
    dto: UpdateEventStatusDto,
  ): Promise<EventDocument> {
    const event = await this.findById(id);
    const allowed = EVENT_TRANSITIONS[event.status];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Invalid transition: ${event.status} → ${dto.status}. Allowed: [${allowed.join(', ') || 'none'}]`,
      );
    }
    event.status = dto.status;
    return event.save();
  }

  async rsvp(eventId: string, userId: string): Promise<EventDocument> {
    const event = await this.findById(eventId);
    if (event.status === EventStatus.ENDED) {
      throw new BadRequestException('Cannot RSVP to an ended event');
    }
    const userObjId = new Types.ObjectId(userId);
    // Idempotent: $addToSet prevents duplicates
    const updated = await this.eventModel
      .findByIdAndUpdate(
        eventId,
        { $addToSet: { rsvps: userObjId } },
        { new: true },
      )
      .exec();
    return updated;
  }

  async getAttendees(eventId: string): Promise<Types.ObjectId[]> {
    const event = await this.findById(eventId);
    return event.rsvps;
  }
}
