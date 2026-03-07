import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

@Injectable()
export class UsersService {
    constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) { }

    async upsertFromKeycloak(dto: CreateUserDto): Promise<UserDocument> {
        return this.userModel.findOneAndUpdate(
            { keycloakId: dto.keycloakId },
            { $set: dto },
            { upsert: true, new: true },
        );
    }

    async findMe(keycloakId: string): Promise<UserDocument> {
        const user = await this.userModel.findOne({ keycloakId });
        if (!user) throw new NotFoundException('User not found');
        return user;
    }

    async updateMe(keycloakId: string, dto: UpdateUserDto): Promise<UserDocument> {
        const user = await this.userModel.findOneAndUpdate(
            { keycloakId },
            { $set: dto },
            { new: true },
        );
        if (!user) throw new NotFoundException('User not found');
        return user;
    }

    async findById(id: string): Promise<UserDocument> {
        const user = await this.userModel.findById(id);
        if (!user) throw new NotFoundException('User not found');
        return user;
    }

    async findAll(): Promise<UserDocument[]> {
        return this.userModel.find().exec();
    }
}
