import { IsString, IsOptional, IsArray, IsEnum, MinLength, IsUUID } from 'class-validator';
import { ResearchStatus } from '../schemas/research.schema';

export class CreateResearchDto {
    @IsString()
    @MinLength(3)
    title: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    tags?: string[];
}

export class UpdateResearchDto {
    @IsOptional()
    @IsString()
    title?: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsEnum(ResearchStatus)
    status?: ResearchStatus;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    tags?: string[];
}

export class InviteCollaboratorDto {
    @IsUUID()
    userId: string;
}
