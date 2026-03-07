import { IsString, IsOptional, MinLength } from 'class-validator';

export class CreatePostDto {
    @IsString()
    @MinLength(1)
    content: string;

    @IsString()
    @IsOptional()
    imageUrl?: string;
}

export class PaginationDto {
    @IsOptional()
    page?: number = 1;

    @IsOptional()
    limit?: number = 10;
}
