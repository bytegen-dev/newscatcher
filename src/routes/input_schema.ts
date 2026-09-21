import type { Request, Response } from 'express';

export function getInputSchema(_req: Request, res: Response): void {
  res.json({
    input_data: [
      {
        id: 'query',
        type: 'string',
        name: 'Search query',
        data: {
          description: 'Keywords or Boolean query for news articles',
          placeholder: 'e.g. Cardano AND Masumi NOT scam',
        },
      },
      {
        id: 'lang',
        type: 'string',
        name: 'Language',
        data: {
          description: 'ISO language code(s), comma-separated',
          default: 'en',
          placeholder: 'en',
        },
        validations: [{ validation: 'optional', value: 'true' }],
      },
      {
        id: 'countries',
        type: 'string',
        name: 'Countries',
        data: {
          description: 'Optional ISO country filter (comma-separated, e.g. US,GB,NG)',
          placeholder: 'US,GB',
        },
        validations: [{ validation: 'optional', value: 'true' }],
      },
      {
        id: 'from_date',
        type: 'string',
        name: 'From date',
        data: {
          description: 'Optional start date (NewsCatcher from_ format, e.g. 2026-01-01 or "7 days ago")',
          placeholder: '7 days ago',
        },
        validations: [{ validation: 'optional', value: 'true' }],
      },
      {
        id: 'limit',
        type: 'number',
        name: 'Article count',
        data: {
          description: 'Number of articles to return (1–25)',
          default: 10,
        },
        validations: [
          { validation: 'optional', value: 'true' },
          { validation: 'min', value: 1 },
          { validation: 'max', value: 25 },
        ],
      },
    ],
  });
}
