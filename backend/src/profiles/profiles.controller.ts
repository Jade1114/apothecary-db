import { Controller, Get } from '@nestjs/common';
import { ProfileRecord, ProfilesService } from './profiles.service';

@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get()
  getProfiles(): { profiles: ProfileRecord[] } {
    return {
      profiles: this.profilesService.listProfiles(),
    };
  }

  @Get('current')
  getCurrentProfile(): { profile: ProfileRecord | null } {
    return {
      profile: this.profilesService.getLatestProfile(),
    };
  }
}
