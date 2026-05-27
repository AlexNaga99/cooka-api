import {
  Controller,
  Post,
  Param,
  UseGuards,
  Body,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { FirebaseAuthGuard } from '../common/guards/firebase-auth.guard';
import { CurrentUser, FirebaseUser } from '../common/decorators/current-user.decorator';
import { ReportRequestDto, ReportResponseDto } from './dto/report.dto';
import { ErrorResponseDto } from '../common/dto/error.dto';

@ApiTags('Reports')
@Controller()
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post('recipes/:id/report')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Denunciar receita' })
  @ApiParam({ name: 'id', description: 'ID da receita' })
  @ApiResponse({ status: 201, type: ReportResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @ApiResponse({ status: 409, type: ErrorResponseDto, description: 'Já denunciou esta receita' })
  async reportRecipe(
    @Param('id') id: string,
    @CurrentUser() user: FirebaseUser,
    @Body() dto: ReportRequestDto,
  ): Promise<ReportResponseDto> {
    return this.reportsService.reportRecipe(user.uid, id, dto);
  }

  @Post('users/:id/report')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Denunciar usuário' })
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiResponse({ status: 201, type: ReportResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @ApiResponse({ status: 409, type: ErrorResponseDto, description: 'Já denunciou este usuário' })
  async reportUser(
    @Param('id') id: string,
    @CurrentUser() user: FirebaseUser,
    @Body() dto: ReportRequestDto,
  ): Promise<ReportResponseDto> {
    return this.reportsService.reportUser(user.uid, id, dto);
  }
}
