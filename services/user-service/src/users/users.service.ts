import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) { }

  async upsertFromKeycloak(dto: CreateUserDto): Promise<UserDocument> {
    // Match by keycloakId first; fall back to email match to handle Keycloak
    // user re-creation (deleted + recreated → new sub, same email).
    // Without the $or, a duplicate unique email causes a 500 crash.
    return this.userModel.findOneAndUpdate(
      { $or: [{ keycloakId: dto.keycloakId }, { email: dto.email }] },
      { $set: dto },
      { upsert: true, new: true },
    );
  }

  async findMe(keycloakId: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ keycloakId });
  }

  async updateMe(
    keycloakId: string,
    dto: UpdateUserDto,
  ): Promise<UserDocument> {
    const user = await this.userModel.findOneAndUpdate(
      { keycloakId },
      { $set: dto },
      { new: true },
    );
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findById(id: string): Promise<UserDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid user ID format');
    }
    const user = await this.userModel.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findAll(): Promise<UserDocument[]> {
    return this.userModel.find().exec();
  }
}
