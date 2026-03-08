import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MulterModule } from '@nestjs/platform-express';
import { ResearchController } from './research.controller';
import { ResearchService } from './research.service';
import { Research, ResearchSchema } from './schemas/research.schema';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Research.name, schema: ResearchSchema },
        ]),
        MulterModule.register({ storage: undefined }), // use memory storage (buffer)
    ],
    controllers: [ResearchController],
    providers: [ResearchService],
})
export class ResearchModule { }
