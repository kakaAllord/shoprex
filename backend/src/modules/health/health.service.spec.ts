import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../database/prisma.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;
  let ping: jest.Mock;

  beforeEach(async () => {
    ping = jest.fn().mockResolvedValue(undefined);

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: PrismaService, useValue: { ping } },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, fallback?: unknown) =>
              ({
                'app.nodeEnv': 'test',
                'app.defaultTimezone': 'Africa/Dar_es_Salaam',
              })[key] ?? fallback,
          },
        },
      ],
    }).compile();

    service = moduleRef.get(HealthService);
  });

  describe('liveness', () => {
    it('reports the service as up without touching the database', () => {
      const result = service.getLiveness();

      expect(result.status).toBe('ok');
      expect(result.service).toBe('shoprex-backend');
      expect(result.environment).toBe('test');
      expect(result.timezone).toBe('Africa/Dar_es_Salaam');
      expect(ping).not.toHaveBeenCalled();
    });
  });

  describe('readiness', () => {
    it('reports ok with a latency reading when PostgreSQL answers', async () => {
      const result = await service.getReadiness();

      expect(ping).toHaveBeenCalledTimes(1);
      expect(result.status).toBe('ok');
      expect(result.database.status).toBe('ok');
      expect(result.database.latencyMs).not.toBeNull();
    });

    it('reports an error instead of throwing when PostgreSQL is unreachable', async () => {
      ping.mockRejectedValueOnce(new Error('connection refused'));

      const result = await service.getReadiness();

      expect(result.status).toBe('error');
      expect(result.database.status).toBe('error');
      expect(result.database.latencyMs).toBeNull();
      expect(result.database.message).toContain('connection refused');
    });
  });
});
