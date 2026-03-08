import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FeedService } from './feed.service';
import { CreatePostDto, PaginationDto } from './dto/post.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('feed')
@UseGuards(JwtAuthGuard)
export class FeedController {
  constructor(private readonly feedService: FeedService) { }

  @Get('health')
  health() {
    return { status: 'ok', service: 'feed-service' };
  }

  @Post()
  async create(@Request() req, @Body() dto: CreatePostDto) {
    return this.feedService.create(req.user.sub, req.user.role, dto);
  }

  @Get()
  async getFeed(@Query() query: PaginationDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const role = query.role;
    return this.feedService.getFeed(page, limit, role);
  }

  // G9.1: Single-post retrieval
  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.feedService.findById(id);
  }

  @Post(':id/like')
  async like(@Param('id') id: string, @Request() req) {
    return this.feedService.likePost(id, req.user.sub, req.headers.authorization);
  }

  @Delete(':id/like')
  async unlike(@Param('id') id: string, @Request() req) {
    return this.feedService.unlikePost(id, req.user.sub);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    const url = await this.feedService.uploadImage(file.buffer, file.mimetype);
    return { imageUrl: url };
  }

  // G2.1: Verify a MinIO object exists by its within-bucket path
  @Get('upload/verify')
  async verifyImage(@Query('path') path: string) {
    if (!path) throw new BadRequestException('path query parameter is required');
    return this.feedService.verifyImage(path);
  }
}
