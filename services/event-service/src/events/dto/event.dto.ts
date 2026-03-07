import { IsString, IsOptional, IsEnum, IsDateString } from 'class-validator';
import { EventStatus } from '../schemas/event.schema';

export class CreateEventDto {
    @IsString()
    title: string;

    @IsString()
    description: string;

    @IsDateString()
    eventDate: string;

    @IsString()
    @IsOptional()
    location?: string;
}

export class UpdateEventStatusDto {
    @IsEnum(EventStatus)
    status: EventStatus;
}
