import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Param,
    Body,
    UseGuards,
    Request,
    UseInterceptors,
    UploadedFile,
    BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ResearchService } from './research.service';
import {
    CreateResearchDto,
    UpdateResearchDto,
    InviteCollaboratorDto,
} from './dto/research.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('research')
@UseGuards(JwtAuthGuard)
export class ResearchController {
    constructor(private readonly researchService: ResearchService) { }

    // Any authenticated user: create project
    @Post()
    create(@Request() req, @Body() dto: CreateResearchDto) {
        return this.researchService.create(req.user.sub, dto);
    }

    // Any authenticated user: list all projects
    @Get()
    findAll() {
        return this.researchService.findAll();
    }

    // Any authenticated user: get project detail
    @Get(':id')
    findById(@Param('id') id: string) {
        return this.researchService.findById(id);
    }

    // Owner only: update project metadata
    @Patch(':id')
    update(
        @Param('id') id: string,
        @Request() req,
        @Body() dto: UpdateResearchDto,
    ) {
        return this.researchService.update(id, req.user.sub, dto);
    }

    // Owner only: delete project
    @Delete(':id')
    remove(@Param('id') id: string, @Request() req) {
        return this.researchService.remove(id, req.user.sub);
    }

    // Owner only: invite collaborator
    @Post(':id/invite')
    invite(
        @Param('id') id: string,
        @Request() req,
        @Body() dto: InviteCollaboratorDto,
    ) {
        return this.researchService.inviteCollaborator(id, req.user.sub, dto);
    }

    // Owner only: remove collaborator
    @Delete(':id/collaborators/:userId')
    removeCollaborator(
        @Param('id') id: string,
        @Param('userId') userId: string,
        @Request() req,
    ) {
        return this.researchService.removeCollaborator(id, req.user.sub, userId);
    }

    // Owner or collaborator: upload document
    @Post(':id/documents')
    @UseInterceptors(FileInterceptor('file'))
    uploadDocument(
        @Param('id') id: string,
        @Request() req,
        @UploadedFile() file?: Express.Multer.File,
    ) {
        if (!file) throw new BadRequestException('A file attachment is required');
        return this.researchService.uploadDocument(id, req.user.sub, file);
    }

    // Any authenticated user: list documents
    @Get(':id/documents')
    listDocuments(@Param('id') id: string) {
        return this.researchService.listDocuments(id);
    }
}
