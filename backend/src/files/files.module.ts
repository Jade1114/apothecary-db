import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { FilesService } from './files.service';

@Module({
    imports: [ConfigModule],
    providers: [FilesService],
    exports: [FilesService],
})
export class FilesModule {}
