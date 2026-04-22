import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ProfilesService } from './profiles.service';
import type {
    CurrentProfileResponse,
    ProfileDetailResponse,
    ProfilesListResponse,
} from './types/profile.types';

@Controller('profiles')
export class ProfilesController {
    constructor(private readonly profilesService: ProfilesService) {}

    @Get()
    getProfiles(): ProfilesListResponse {
        return {
            profiles: this.profilesService.listProfiles(),
        };
    }

    @Get(':id')
    getProfileById(
        @Param('id', ParseIntPipe) id: number,
    ): ProfileDetailResponse {
        return {
            profile: this.profilesService.getProfileById(id),
        };
    }

    @Get('current')
    getCurrentProfile(): CurrentProfileResponse {
        return {
            profile: this.profilesService.getLatestProfile(),
        };
    }
}
