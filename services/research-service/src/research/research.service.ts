import {
    Injectable,
    NotFoundException,
    ForbiddenException,
    BadRequestException,
    ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as Minio from 'minio';
import { Research, ResearchMongo, ResearchStatus } from './schemas/research.schema';
import {
    CreateResearchDto,
    UpdateResearchDto,
    InviteCollaboratorDto,
} from './dto/research.dto';

@Injectable()
export class ResearchService {
    private minioClient: Minio.Client;
    private readonly bucket = 'research-docs';

    constructor(
        @InjectModel(Research.name) private researchModel: Model<ResearchMongo>,
    ) {
        this.minioClient = new Minio.Client({
            endPoint: process.env.MINIO_ENDPOINT || 'minio',
            port: parseInt(process.env.MINIO_PORT || '9000'),
            useSSL: false,
            accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
            secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
        });
        this.ensureBucket();
    }

    private async ensureBucket() {
        try {
            const exists = await this.minioClient.bucketExists(this.bucket);
            if (!exists) await this.minioClient.makeBucket(this.bucket, 'us-east-1');
        } catch (e) {
            console.warn('[research-service] MinIO bucket check failed:', e.message);
        }
    }

    async create(ownerId: string, dto: CreateResearchDto): Promise<ResearchMongo> {
        return this.researchModel.create({ ownerId, ...dto });
    }

    async findAll(): Promise<ResearchMongo[]> {
        return this.researchModel.find().sort({ createdAt: -1 }).exec();
    }

    async findById(id: string): Promise<ResearchMongo> {
        const project = await this.researchModel.findById(id);
        if (!project) throw new NotFoundException('Research project not found');
        return project;
    }

    async update(
        id: string,
        requesterId: string,
        dto: UpdateResearchDto,
    ): Promise<ResearchMongo> {
        const project = await this.findById(id);
        this.assertOwner(project, requesterId);
        const updated = await this.researchModel
            .findByIdAndUpdate(id, { $set: dto }, { new: true, runValidators: true })
            .exec();
        if (!updated) throw new NotFoundException('Research project not found');
        return updated;
    }

    async remove(id: string, requesterId: string): Promise<{ deleted: boolean }> {
        const project = await this.findById(id);
        this.assertOwner(project, requesterId);
        await this.researchModel.findByIdAndDelete(id);
        return { deleted: true };
    }

    async inviteCollaborator(
        id: string,
        requesterId: string,
        dto: InviteCollaboratorDto,
    ): Promise<ResearchMongo> {
        const project = await this.findById(id);
        this.assertOwner(project, requesterId);
        const alreadyMember = project.collaborators.includes(dto.userId);
        if (!alreadyMember) {
            project.collaborators.push(dto.userId);
            await project.save();
        }
        // G8.1: Fire-and-forget collaboration invite notification to the invited user
        if (!alreadyMember) {
            const internalToken = process.env.INTERNAL_TOKEN || 'miniproject-internal-auth-token';
            fetch('http://notification-service.miniproject.svc.cluster.local:3006/api/v1/internal/notifications/notify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-internal-token': internalToken },
                body: JSON.stringify({
                    userId: dto.userId,
                    type: 'general',
                    message: `You have been invited to collaborate on research project "${project.title}"`,
                    idempotencyKey: `collaboration_invite:${project._id}:${dto.userId}`,
                }),
            }).catch(err => console.error('[research-service] Failed to dispatch collaboration_invite notification:', err));
        }
        return project;
    }

    async removeCollaborator(
        id: string,
        requesterId: string,
        userId: string,
    ): Promise<ResearchMongo> {
        const project = await this.findById(id);
        this.assertOwner(project, requesterId);
        const idx = project.collaborators.indexOf(userId);
        if (idx === -1) throw new NotFoundException('Collaborator not found in project');
        project.collaborators.splice(idx, 1);
        return project.save();
    }

    async uploadDocument(
        id: string,
        requesterId: string,
        file: Express.Multer.File,
    ): Promise<ResearchMongo> {
        const project = await this.findById(id);

        // G5.2: Block uploads to archived projects (checked before MinIO so works even when MinIO is down)
        if (project.status === ResearchStatus.ARCHIVED) {
            throw new BadRequestException('Cannot upload documents to an archived project');
        }

        const isOwnerOrCollaborator =
            project.ownerId === requesterId ||
            project.collaborators.includes(requesterId);
        if (!isOwnerOrCollaborator)
            throw new ForbiddenException('Only project members can upload documents');

        const minioKey = `${id}/${Date.now()}-${file.originalname}`;
        try {
            await this.minioClient.putObject(
                this.bucket,
                minioKey,
                file.buffer,
                file.size,
                { 'Content-Type': file.mimetype },
            );
        } catch (minioError) {
            throw new ServiceUnavailableException('Document storage is temporarily unavailable');
        }

        try {
            project.documents.push({
                name: file.originalname,
                minioKey,
                uploadedAt: new Date(),
                size: file.size,   // G5.1: store byte size as proof of successful MinIO upload
            });
            return await project.save();
        } catch (dbError) {
            await this.minioClient.removeObject(this.bucket, minioKey).catch(err => {
                console.error('Failed to cleanup MinIO object after DB failure:', err);
            });
            throw dbError;
        }
    }

    async listDocuments(id: string): Promise<ResearchMongo['documents']> {
        const project = await this.findById(id);
        return project.documents;
    }

    private assertOwner(project: ResearchMongo, requesterId: string) {
        if (project.ownerId !== requesterId) {
            throw new ForbiddenException('Only the project owner can perform this action');
        }
    }
}
