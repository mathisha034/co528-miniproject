import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { EventsService } from './events.service';
import { CreateEventDto, UpdateEventStatusDto } from './dto/event.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('events')
@UseGuards(JwtAuthGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  // Alumni/Admin: create event
  @Post()
  @UseGuards(RolesGuard)
  @Roles('alumni', 'admin')
  create(@Request() req, @Body() dto: CreateEventDto) {
    return this.eventsService.create(req.user.sub, dto);
  }

  // Any authenticated: list events
  @Get()
  findAll() {
    return this.eventsService.findAll();
  }

  // Alumni/Admin: update status (upcoming → live → ended)
  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles('alumni', 'admin')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateEventStatusDto) {
    return this.eventsService.updateStatus(id, dto);
  }

  // Any authenticated: RSVP (idempotent)
  @Post(':id/rsvp')
  rsvp(@Param('id') id: string, @Request() req) {
    return this.eventsService.rsvp(id, req.user.sub);
  }

  // Alumni/Admin: view attendees
  @Get(':id/attendees')
  @UseGuards(RolesGuard)
  @Roles('alumni', 'admin')
  getAttendees(@Param('id') id: string) {
    return this.eventsService.getAttendees(id);
  }
}
