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

// Valid status transitions: upcoming → live|cancelled, live → ended|cancelled (terminal: ended, cancelled)
const EVENT_TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  [EventStatus.UPCOMING]: [EventStatus.LIVE, EventStatus.CANCELLED],
  [EventStatus.LIVE]: [EventStatus.ENDED, EventStatus.CANCELLED],
  [EventStatus.ENDED]: [],
  [EventStatus.CANCELLED]: [],
};

@Injectable()
export class EventsService {
  constructor(
    @InjectModel(EventEntity.name) private eventModel: Model<EventDocument>,
  ) { }

  async create(createdBy: string, dto: CreateEventDto): Promise<EventDocument> {
    const event = await this.eventModel.create({
      createdBy,
      ...dto,
      eventDate: new Date(dto.eventDate),
      rsvps: [],  // G4.1: explicitly include so field appears in creation response
    });

    // G4.2: Fire-and-forget GENERAL notification to event creator
    const internalToken =
      process.env.INTERNAL_TOKEN || 'miniproject-internal-auth-token';
    fetch(
      'http://notification-service.miniproject.svc.cluster.local:3006/api/v1/internal/notifications/notify',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-token': internalToken,
        },
        body: JSON.stringify({
          userId: createdBy,
          type: 'general',
          message: `Your event "${event.title}" has been created successfully`,
          idempotencyKey: `event_created:${event._id}:${createdBy}`,
        }),
      },
    ).catch((err) =>
      console.error(
        '[event-service] Failed to dispatch event_created notification:',
        err,
      ),
    );

    return event;
  }

  async findAll(): Promise<EventDocument[]> {
    return this.eventModel.find().sort({ eventDate: 1 }).exec();
  }

  async findById(id: string): Promise<EventDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid event ID format');
    }
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
    const saved = await event.save();

    // G4.5: Fire-and-forget EVENT_STATUS_CHANGED to all attendees on cancellation
    if (dto.status === EventStatus.CANCELLED && saved.rsvps.length > 0) {
      const internalToken =
        process.env.INTERNAL_TOKEN || 'miniproject-internal-auth-token';
      for (const attendeeId of saved.rsvps) {
        fetch(
          'http://notification-service.miniproject.svc.cluster.local:3006/api/v1/internal/notifications/notify',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-internal-token': internalToken,
            },
            body: JSON.stringify({
              userId: attendeeId,
              type: 'event_status_changed',
              message: `The event "${saved.title}" has been cancelled`,
              idempotencyKey: `event_cancelled:${id}:${attendeeId}`,
            }),
          },
        ).catch((err) =>
          console.error('[event-service] Failed to dispatch cancellation notification:', err),
        );
      }
    }

    return saved;
  }

  async rsvp(eventId: string, userId: string): Promise<EventDocument> {
    const event = await this.findById(eventId);
    if (event.status === EventStatus.ENDED || event.status === EventStatus.CANCELLED) {
      throw new BadRequestException('Cannot RSVP to an ended or cancelled event');
    }
    // Idempotent: $addToSet prevents duplicates
    const updated = await this.eventModel
      .findByIdAndUpdate(
        eventId,
        { $addToSet: { rsvps: userId } },
        { new: true },
      )
      .exec();
    if (!updated) {
      throw new NotFoundException('Event not found or was deleted during RSVP');
    }
    return updated;
  }

  // G4.3: Cancel (remove) a user's RSVP
  async cancelRsvp(eventId: string, userId: string): Promise<EventDocument> {
    const event = await this.findById(eventId);
    if (event.status === EventStatus.ENDED || event.status === EventStatus.CANCELLED) {
      throw new BadRequestException('Cannot cancel RSVP for an ended or cancelled event');
    }
    const updated = await this.eventModel
      .findByIdAndUpdate(
        eventId,
        { $pull: { rsvps: userId } },
        { new: true },
      )
      .exec();
    if (!updated) throw new NotFoundException('Event not found');
    return updated;
  }

  async getAttendees(eventId: string): Promise<string[]> {
    const event = await this.findById(eventId);
    return event.rsvps;
  }
}
