import { Injectable } from '@nestjs/common';
import { ConfigService } from '../config/config.service';

@Injectable()
export class HealthService {
  constructor(private readonly configService: ConfigService) {}

  getHealth(): { status: string; app: string } {
    return {
      status: 'ok',
      app: this.configService.appName,
    };
  }
}
