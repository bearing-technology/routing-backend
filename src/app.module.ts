import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ScheduleModule } from "@nestjs/schedule";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { OtpService } from "./OtpService";
import { RoutingModule } from "./routing/routing.module";
import {
  BrlEurOtcProvider,
  MxnUsdOtcProvider,
  NgnEurOtcProvider,
  StablecoinIntermediaryProvider,
} from "./routing/providers/example-otc.providers";
import { DexProvider } from "./routing/providers/dex.provider";
import { AlphaVantageProvider } from "./routing/providers/alphavantage.provider";
import { BrlProvider } from "./routing/providers/brlprovider";

@Module({
  imports: [
    ConfigModule.forRoot(),
    ScheduleModule.forRoot(),
    RoutingModule.register([
      new BrlEurOtcProvider(),
      new MxnUsdOtcProvider(),
      new NgnEurOtcProvider(),
      new StablecoinIntermediaryProvider(),
      new DexProvider(), // Add DEX provider for pathfinding comparison
      new AlphaVantageProvider(), // Real-time FX quotes from Alpha Vantage
      new BrlProvider(),
    ]),
  ],
  controllers: [AppController],
  providers: [AppService, OtpService],
})
export class AppModule {}
