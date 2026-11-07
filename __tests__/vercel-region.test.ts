import fs from 'fs';
import path from 'path';

const config = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8')
);

describe('vercel.json (N13 region)', () => {
  it('define regions ["gru1"]', () => {
    expect(config.regions).toEqual(['gru1']);
  });

  it('conserva los 2 crons existentes con sus horarios', () => {
    expect(config.crons).toHaveLength(2);
    expect(config.crons).toEqual(
      expect.arrayContaining([
        {
          path: '/api/admin/inversion-mercaderia/snapshot',
          schedule: '55 2 * * *',
        },
        { path: '/api/cron/liberar-reservas', schedule: '17 4 * * *' },
      ])
    );
  });
});
