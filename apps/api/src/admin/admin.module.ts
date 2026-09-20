import { Module } from '@nestjs/common';
import { SearchModule } from '../discovery/search.module.js';
import { AdminAuthService } from './admin-auth.service.js';
import { AdminController } from './admin.controller.js';
import { AdminGuard, RequireAdminRoleGuard } from './admin.guard.js';
import { AdminService } from './admin.service.js';

@Module({
  imports: [SearchModule],
  controllers: [AdminController],
  providers: [AdminAuthService, AdminService, AdminGuard, RequireAdminRoleGuard],
  exports: [AdminService],
})
export class AdminModule {}
