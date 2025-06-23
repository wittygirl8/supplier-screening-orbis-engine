import * as fs from 'fs';
import {
  AlignmentType,
  BorderStyle,
  ExternalHyperlink,
  Paragraph,
  patchDocument,
  PatchType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import topdf from 'docx2pdf-converter';
import axios from 'axios';
import * as cheerio from 'cheerio';

import { BlobServiceClient } from '@azure/storage-blob';

import { getOrdinalSuffix, getRiskColor } from './helpers.js';

let template = 'aramco_template.docx';
let links = [];
const kpi_codes = ['NWS1A', 'ONF1A'];

// Azure Storage Credentials
const { BLOB_STORAGE__CONNECTION_STRING } = process.env;

// Initialize Azure Blob Service Client
const blobServiceClient = BlobServiceClient.fromConnectionString(
  BLOB_STORAGE__CONNECTION_STRING
);

// Function to upload a file to Azure Blob Storage
const uploadToAzure = async (filePath, fileName, session_id) => {
  try {
    const containerClient = blobServiceClient.getContainerClient(session_id);
    const blobClient = containerClient.getBlockBlobClient(fileName);
    const fileBuffer = fs.readFileSync(filePath);

    await blobClient.uploadData(fileBuffer);
    return blobClient.url;
  } catch (error) {
    console.error(`Error uploading ${fileName} to Azure:`, error);
  }
};

const borders = {
  top: {
    style: BorderStyle.SINGLE,
    size: 1,
    color: 'D3D3D3',
  }, // Light gray
  bottom: {
    style: BorderStyle.SINGLE,
    size: 1,
    color: 'D3D3D3',
  },
  left: {
    style: BorderStyle.SINGLE,
    size: 1,
    color: 'D3D3D3',
  },
  right: {
    style: BorderStyle.SINGLE,
    size: 1,
    color: 'D3D3D3',
  },
};

const createTextRun = (options) => ({
  type: PatchType.PARAGRAPH,
  children: [new TextRun(options)],
});

const createCell = (
  text,
  {
    background = 'F2F2F2',
    alignment = 'center',
    bold = true,
    columnSpan = 1,
    ...rest
  } = {}
) => {
  return new TableCell({
    verticalAlign: 'center',
    children: [
      ...text.split(/\n+/).map(
        (text) =>
          new Paragraph({
            alignment,
            children: [new TextRun({ text, bold, size: 20 })],
          })
      ),
    ],
    shading: { fill: background },
    columnSpan: columnSpan || 1,
    ...rest,
  });
};

const highlightRating = (rating) => ({
  type: PatchType.DOCUMENT,
  children: [
    new Table({
      width: {
        size: 15,
        type: WidthType.PERCENTAGE,
      },
      borders: {
        top: {
          style: BorderStyle.NONE,
        },
        bottom: {
          style: BorderStyle.NONE,
        },
        left: {
          style: BorderStyle.NONE,
        },
        right: {
          style: BorderStyle.NONE,
        },
      },

      rows: [
        new TableRow({
          height: { rule: 'atLeast', value: 550 },

          children: [
            new TableCell({
              verticalAlign: 'center',
              shading: {
                fill: getRiskColor(rating).background,
              },
              children: [
                new Paragraph({
                  alignment: 'center',
                  children: [
                    new TextRun({
                      text: `${rating}`,
                      color: getRiskColor(rating).color,
                      bold: true,
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    }),
  ],
});

const noAnnexure = () => {
  return [
    new Table({
      width: {
        size: 100,
        type: WidthType.PERCENTAGE,
      },

      rows: [
        new TableRow({
          height: { rule: 'atLeast', value: 500 },
          children: [
            new TableCell({
              verticalAlign: 'center',
              shading: {
                fill: 'F2F2F2',
              },
              children: [
                new Paragraph({
                  alignment: 'center',
                  children: [
                    new TextRun({
                      text: 'NO ANNEXURE',
                      bold: true,
                      size: 20,
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    }),
    new Paragraph({}),
  ];
};

const createNoHitsTable = (text = '') => {
  return [
    new Table({
      width: {
        size: 100,
        type: WidthType.PERCENTAGE,
      },

      rows: [
        new TableRow({
          height: { rule: 'atLeast', value: 500 },
          children: [
            new TableCell({
              verticalAlign: 'center',
              shading: {
                fill: 'F2F2F2',
              },
              children: [
                new Paragraph({
                  alignment: 'center',
                  children: [
                    new TextRun({
                      text: text
                        ? `${text} - NO TRUE HITS IDENTIFIED`
                        : 'NO TRUE HITS IDENTIFIED',
                      bold: true,
                      size: 20,
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    }),
    new Paragraph({}),
  ];
};

const createFindingsInnerTable = (findings) => {
  return [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },

      rows: [
        // Header row
        new TableRow({
          height: { rule: 'atLeast', value: 500 },

          children: [
            createCell('Name & Relation', {
              background: 'f2f2f2',
              alignment: 'left',
              width: {
                size: 20,
                type: WidthType.PERCENTAGE,
              },
            }),
            createCell(findings.title, {
              background: 'ffffff',
              alignment: 'center',
              bold: false,
              width: {
                size: 50,
                type: WidthType.PERCENTAGE,
              },
            }),
            createCell('Rating', {
              width: {
                size: 15,
                type: WidthType.PERCENTAGE,
              },
            }),
            createCell(findings.rating, {
              background: 'ffffff',
              alignment: 'center',
              bold: false,
              width: {
                size: 15,
                type: WidthType.PERCENTAGE,
              },
            }),
          ],
        }),
        // Findings row (merged across 4 columns)
        new TableRow({
          height: { rule: 'atLeast', value: 500 },
          children: [
            createCell('Findings', {
              columnSpan: 4,
              alignment: 'left',
              background: 'f2f2f2',
            }),
          ],
        }),
        new TableRow({
          height: { rule: 'atLeast', value: 500 },
          children: [
            new TableCell({
              shading: { fill: 'ffffff' },
              columnSpan: 4,

              children: [
                new Paragraph({
                  children: [new TextRun({ break: 1 })],
                }),
                new Table({
                  width: { size: 100, type: WidthType.PERCENTAGE },
                  rows: [
                    new TableRow({
                      height: { rule: 'atLeast', value: 500 },
                      children: [
                        createCell(findings.inner_title, {
                          width: { size: 30, type: WidthType.PERCENTAGE },
                        }),
                        createCell('Rating', {
                          width: { size: 15, type: WidthType.PERCENTAGE },
                        }),
                        createCell('Notes', {
                          width: { size: 55, type: WidthType.PERCENTAGE },
                        }),
                      ],
                    }),

                    ...findings.data.map((item) => {
                      return new TableRow({
                        height: { rule: 'atLeast', value: 500 },
                        children: [
                          createCell(item.kpi_definition, {
                            background: 'ffffff',
                            bold: false,
                            width: {
                              size: 30,
                              type: WidthType.PERCENTAGE,
                            },
                          }),
                          createCell(item.kpi_rating, {
                            background: 'ffffff',
                            bold: false,
                            width: {
                              size: 15,
                              type: WidthType.PERCENTAGE,
                            },
                          }),
                          createCell(item.kpi_details, {
                            background: 'ffffff',
                            bold: false,
                            width: {
                              size: 55,
                              type: WidthType.PERCENTAGE,
                            },
                          }),
                        ],
                      });
                    }),
                  ],
                }),
                new Paragraph({}),

                new Paragraph({
                  children: [
                    new TextRun({ text: 'Source:', bold: true }),
                    new TextRun({ text: ' EY Network Alliance Databases' }),
                  ],
                }),

                new Paragraph({}),

                findings.inner_title === 'ESG Indicators' &&
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: 'Notes:',
                        bold: true,
                        break: 1,
                        underline: true,
                      }),
                      new TextRun({
                        text: '',
                        break: 1,
                      }),
                      new TextRun({
                        text: '',
                        break: 1,
                      }),
                      new TextRun({
                        text: 'ESG Ratings ',
                        bold: true,
                      }),
                      new TextRun({
                        text: '(if applicable):',
                        bold: true,
                      }),
                      new TextRun({
                        text: 'High/Weak : 0-29; Medium/Moderate: 30-49; Low/Robust:50-100',
                        break: 1,
                      }),
                    ],
                  }),

                new Paragraph({}),
                findings.inner_title === 'Cyber Security Indicators' &&
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: 'Notes:',
                        bold: true,
                        break: 1,
                        underline: true,
                      }),
                      new TextRun({
                        text: '',
                        break: 1,
                      }),
                      new TextRun({
                        text: '',
                        break: 1,
                      }),
                      new TextRun({
                        text: 'Cyber Ratings ',
                        bold: true,
                      }),
                      new TextRun({
                        text: '(if applicable):',
                        bold: true,
                      }),
                      new TextRun({
                        text: 'High: <650; Medium: 650-750; Low: 751 - 900',
                        break: 1,
                      }),
                    ],
                  }),
                new Paragraph({}),

                findings.inner_title === 'Financial Indicators' &&
                  new Paragraph({}),
              ],
            }),
          ],
        }),
      ],
    }),
    new Paragraph({}),
  ];
};

const createFindingsTable = (findings) => {
  return [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },

      rows: [
        // Header row
        new TableRow({
          height: { rule: 'atLeast', value: 500 },
          // cantSplit: true,
          children: [
            createCell('Name & Relation', {
              background: 'f2f2f2',
              alignment: 'left',
              bold: true,
              width: {
                size: 20,
                type: WidthType.PERCENTAGE,
              },
            }),
            createCell(findings.kpi_definition, {
              background: 'ffffff',
              alignment: 'center',
              bold: false,
              width: {
                size: 50,
                type: WidthType.PERCENTAGE,
              },
            }),
            createCell('Rating', {
              width: {
                size: 15,
                type: WidthType.PERCENTAGE,
              },
            }),
            createCell(findings.kpi_rating, {
              background: 'ffffff',
              alignment: 'center',
              bold: false,
              width: {
                size: 15,
                type: WidthType.PERCENTAGE,
              },
            }),
          ],
        }),
        // Findings row (merged across 4 columns)
        new TableRow({
          height: { rule: 'atLeast', value: 500 },
          children: [
            createCell('Findings', {
              columnSpan: 4,
              alignment: 'left',
              background: 'f2f2f2',
              bold: true,
            }),
          ],
        }),
        new TableRow({
          height: { rule: 'atLeast', value: 500 },
          children: [
            new TableCell({
              children: [
                new Paragraph({}),
                ...findings.kpi_details
                  .trim()
                  .split(/\n+/)
                  .map((text) => {
                    const urlRegex = /(https?:\/\/[^\s]+)/;

                    const match = text.match(urlRegex);
                    let url = match ? match[0] : null;
                    let textAfterUrl = '';

                    if (url) {
                      // Extract text after the URL
                      textAfterUrl = text
                        .replace(/.*https?:\/\/[^\s]+/, '')
                        .trim();
                    }

                    if (url && url.includes('?')) {
                      url = null;
                    }

                    return new Paragraph({
                      spacing: {
                        after: 50,
                        before: 50,
                      },
                      children: [
                        url
                          ? new ExternalHyperlink({
                              children: [
                                new TextRun({ text: '', break: 1 }),
                                new TextRun({
                                  text: 'Source:',
                                  bold: true,
                                }),
                                new TextRun({ text: '', break: 1 }),
                                new TextRun({
                                  text:
                                    links.find((link) => link.url === url)
                                      ?.title ?? 'Source Link',
                                  style: 'Hyperlink',
                                }),
                                new TextRun({ text: ` ${textAfterUrl}` }),
                                new TextRun({ text: '', break: 1 }),
                              ],
                              link: url,
                            })
                          : new TextRun({ text, bold: false }),
                      ],
                    });
                  }),
                new Paragraph({}),
                !kpi_codes.includes(findings.kpi_code) &&
                  new Paragraph({
                    children: [
                      new TextRun({ text: '', break: 1 }),
                      new TextRun({ text: 'Source:', bold: true }),
                      new TextRun({ text: ' EY Network Alliance Databases' }),
                      new TextRun({ text: '', break: 1 }),
                    ],
                  }),
                new Paragraph({}),
              ],

              shading: { fill: 'ffffff' },
              columnSpan: 4,
            }),
          ],
        }),
      ],
    }),
    new Paragraph({}),
  ];
};

const annexureTable = (info) => {
  return [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },

      rows: [
        // Header row
        new TableRow({
          height: { rule: 'atLeast', value: 500 },
          // cantSplit: true,
          children: [
            createCell(info.title, {
              background: 'f2f2f2',
              alignment: 'left',
              bold: true,
              width: {
                size: 100,
                type: WidthType.PERCENTAGE,
              },
            }),
          ],
        }),

        new TableRow({
          height: { rule: 'atLeast', value: 500 },
          children: [
            new TableCell({
              children: [
                ...info.contents
                  .trim()
                  .split(/\n+/)
                  .map((text) => {
                    return new Paragraph({
                      children: [new TextRun({ text, break: 1 })],
                    });
                  }),
                new Paragraph({}),
              ],

              shading: { fill: 'ffffff' },
              columnSpan: 4,
            }),
          ],
        }),
      ],
    }),
    new Paragraph({}),
  ];
};

const processKpiDetails = (findings) => {
  const lines = findings.kpi_details?.trim().split(/\n+/);
  const urls = lines
    .map((text) => {
      const urlRegex = /(https?:\/\/[^\s]+)/;
      const match = text.match(urlRegex);
      return match ? match[0] : null;
    })
    .filter((url) => url);
  return urls;
};

const getPageTitle = async (url) => {
  try {
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);

    let title = $('meta[property="og:title"]').attr('content')?.trim();

    if (!title) {
      title = $('title').text().trim();
    }

    return title || 'Source Link';
  } catch (error) {
    console.error('Error fetching title:', error.message);
    return 'Source Link';
  }
};

export const generateReport = async (payload) => {
  let data;
  try {
    let urls = [];
    links = [];
    const disableRegulatoryAndLegal = !!payload['disable-regulator-and-legal'];

    data = {
      ...payload,
      riskData: [
        { area: 'Sanctions', rating: payload.sanctions_rating },
        {
          area: 'Anti-Bribery and Anti-Corruption',
          rating: payload.anti_rating,
        },
        {
          area: 'Government Ownership and Political Affiliations',
          rating: payload.gov_rating,
        },
        { area: 'Financial Indicators', rating: payload.financial_rating },
        { area: 'Other Adverse Media', rating: payload.adv_rating },
        {
          area: 'Additional Indicators',
          rating: payload.additional_indicators_rating,
        },

        {
          area: 'Regulatory & Legal',
          rating: payload.regulatory_and_legal_rating,
        },
      ],
      riskAreas: {
        sanctions: payload.sanctions_summary,
        antiBriberyAndAntiCorruption: payload.anti_summary,
        governmentOwnershipAndPoliticalAffiliations: payload.gov_summary,
        financialIndicators: payload.financial_summary,
        otherAdverseMedia: payload.adv_summary,
        additional_indicators: payload.additional_indicators_summary,
        ...(!disableRegulatoryAndLegal && {
          regulatoryAndLegal: payload.ral_summary,
        }),
      },
      cyberSecurity_findings: {
        title: `${payload.name} (Self)`,
        rating: payload.cyber_rating,
        inner_title: 'Cyber Security Indicators',
        data: payload.additional_indicators_findings
          ? payload.additional_indicators_data.filter(
              (item) => item.kpi_area === 'CYB'
            )
          : [],
      },
      financial_findings: {
        title: `${payload.name} (Self)`,
        rating: payload.financial_rating,
        inner_title: 'Financial Indicators',
        data: payload.financial_findings ? payload.financial_data : [],
      },
      esg_findings: {
        title: `${payload.name} (Self)`,
        rating: payload.esg_rating,
        inner_title: 'ESG Indicators',
        data: payload.additional_indicators_findings
          ? payload.additional_indicators_data.filter(
              (item) => item.kpi_area === 'ESG'
            )
          : [],
      },
      web_findings: {
        data: payload.additional_indicators_findings
          ? payload.additional_indicators_data.filter(
              (item) => item.kpi_area === 'WEB'
            )
          : [],
      },
    };

    const processUrlProps = [
      'sape_data',
      'reg_data',
      'leg_data',
      'bribery_data',
      'sown_data',
      'adv_data',
      'backruptcy_data',
    ];

    for (const prop of processUrlProps) {
      if (data[prop]) {
        data[prop].map((item) => {
          urls = [...urls, ...processKpiDetails(item)];
        });
      }
    }

    links = await Promise.all(
      urls.map(async (url) => {
        const title = await getPageTitle(url);
        return { url, title };
      })
    );

    if (disableRegulatoryAndLegal) {
      template = 'aramco_template-no-regulatory-legal.docx';
      data.riskData.pop();
    }

    const TEMPLATE_PATH = `src/template/${template}`;

    const date = new Date();
    const day = date.getDate();
    const month = date.toLocaleString('en-US', { month: 'long' });
    const year = date.getFullYear();

    const ordinalSuffix = getOrdinalSuffix(day);

    const doc = await patchDocument({
      outputType: 'nodebuffer',
      data: fs.readFileSync(TEMPLATE_PATH),
      patches: {
        vendorId: createTextRun({
          text: `Vendor ID: ${data.external_vendor_id}`,
        }),
        uploadedName: createTextRun({
          text: `[${data.uploaded_name}]`,
        }),

        title: createTextRun({
          text: data.name,
        }),
        created_date: {
          type: PatchType.PARAGRAPH,
          children: [
            new TextRun({ text: `${day}` }), // Day (bold)
            new TextRun({ text: ordinalSuffix, superScript: true }), // Ordinal suffix (superscript)
            new TextRun({ text: ` ${month} ${year}` }), // Month and year
          ],
        },

        // Company Profile
        company_name: createTextRun({
          text: data.name,
        }),
        company_location: createTextRun({
          text: data.location,
        }),
        company_address: createTextRun({
          text: data.address,
        }),
        company_uploaded_name: createTextRun({
          text: data.uploaded_name,
        }),
        company_external_vendor_id: createTextRun({
          text: data.external_vendor_id,
        }),
        company_website: {
          type: PatchType.DOCUMENT,
          children: [
            new Paragraph({
              children: [
                new ExternalHyperlink({
                  children: [
                    new TextRun({
                      text: data.website,
                      style: 'Hyperlink',
                    }),
                  ],
                  link: data.website,
                }),
              ],
            }),
          ],
        },
        company_active_status: createTextRun({
          text: data.active_status,
        }),
        company_operation_type: createTextRun({
          text: data.operation_type,
        }),
        company_legal_status: createTextRun({
          text: data.legal_status,
        }),
        company_national_identifier: createTextRun({
          text: data.national_id,
        }),
        company_alias: {
          type: PatchType.DOCUMENT,
          children: [
            new Paragraph({}),
            ...data.alias.split(/\n+/).map(
              (text) =>
                new Paragraph({
                  children: [new TextRun({ text, break: 1 })],
                })
            ),
            new Paragraph({}),
          ],
        },

        company_incorporation_date: createTextRun({
          text: data.incorporation_date,
        }),

        company_subsidiaries: createTextRun({
          text: data.subsidiaries,
        }),
        company_corporate_group: createTextRun({
          text: data.corporate_group,
        }),

        shareholders: {
          type: PatchType.DOCUMENT,
          children: [
            new Paragraph({}),
            ...data.shareholders
              .split('\n')
              .map((shareholder) => new Paragraph(shareholder)),
            new Paragraph({}),
          ],
        },
        key_executives: {
          type: PatchType.DOCUMENT,
          children: [
            new Paragraph({}),
            ...data.key_exec
              .split('\n')
              .map((executive) => new Paragraph(executive)),
            new Paragraph({}),
          ],
        },
        company_revenue: createTextRun({
          text: data.revenue,
        }),
        company_employee: createTextRun({
          text: data.employee_count,
        }),

        overall_rating: {
          type: PatchType.DOCUMENT,
          children: [
            new Table({
              columnWidths: [8000, 4000],
              width: {
                size: 70,
                type: WidthType.PERCENTAGE,
              },
              alignment: 'center',

              rows: [
                new TableRow({
                  height: { rule: 'atLeast', value: 500 },

                  children: [
                    new TableCell({
                      verticalAlign: 'center',
                      children: [
                        new Paragraph({
                          alignment: 'center',
                          children: [
                            new TextRun({
                              text: 'OVERALL RISK RATING',
                              bold: true,
                              size: 28,
                            }),
                          ],
                        }),
                      ],
                      borders,
                    }),
                    new TableCell({
                      verticalAlign: 'center',
                      children: [
                        new Paragraph({
                          alignment: 'center',
                          children: [
                            new TextRun({
                              text: data.risk_level,
                              bold: true,
                              size: 28,
                              color: getRiskColor(data.risk_level).color,
                              allCaps: true,
                            }),
                          ],
                        }),
                      ],

                      borders,
                      shading: {
                        fill: getRiskColor(data.risk_level).background, // Apply dynamic color
                      },
                    }),
                  ],
                }),
              ],
            }),
          ],
        },

        overall_summary: {
          type: PatchType.DOCUMENT,
          children: data.summary_of_findings
            .split(/\n+/)
            .map(
              (text) =>
                new Paragraph({ children: [new TextRun({ text, break: 1 })] })
            ),
        },
        risk_areas: {
          type: PatchType.DOCUMENT,
          children: [
            new Table({
              width: {
                size: 75,
                type: WidthType.PERCENTAGE,
              },
              alignment: 'left',
              borders,
              rows: [
                new TableRow({
                  height: { rule: 'atLeast', value: 500 },
                  children: [
                    new TableCell({
                      verticalAlign: 'center',
                      width: {
                        size: 80,
                        type: WidthType.PERCENTAGE,
                      },

                      children: [
                        new Paragraph({
                          alignment: 'center',

                          children: [
                            new TextRun({
                              text: 'Risk Areas',
                              bold: true,
                              color: 'ffffff',
                            }),
                          ],
                        }),
                      ],
                      borders,
                      shading: {
                        fill: '595959', // Apply dynamic color
                      },
                    }),
                    new TableCell({
                      verticalAlign: 'center',
                      children: [
                        new Paragraph({
                          alignment: 'center',
                          children: [
                            new TextRun({
                              text: 'Risk Rating',
                              color: 'ffffff',
                              bold: true,
                            }),
                          ],
                        }),
                      ],
                      borders,
                      shading: {
                        fill: '595959', // Apply dynamic color
                      },
                    }),
                  ],
                }),
                ...data.riskData.map(
                  (risk) =>
                    new TableRow({
                      height: { rule: 'atLeast', value: 500 },
                      children: [
                        new TableCell({
                          verticalAlign: 'center',
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: risk.area,
                                  font: 'EYInterstate Light',
                                }),
                              ],
                            }),
                          ],
                          borders,
                        }),
                        new TableCell({
                          verticalAlign: 'center',
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: risk.rating,
                                  color: getRiskColor(risk.rating).color,
                                  font: 'EYInterstate Light',
                                  size: 20,
                                }),
                              ],
                              alignment: AlignmentType.CENTER,
                            }),
                          ],
                          shading: {
                            fill: getRiskColor(risk.rating).background,
                          },
                          borders,
                        }),
                      ],
                    })
                ),
              ],
            }),
          ],
        },

        riskAreas_antiBriberyAndAntiCorruption: {
          type: PatchType.DOCUMENT,
          children: data.anti_summary.map((text) => {
            return new Paragraph({
              spacing: {
                before: 300,
                after: 300,
              },
              bullet: {
                level: 0,
              },

              children: [
                ...text
                  .trim()
                  .split(/\n+/)
                  .map(
                    (line, index) =>
                      new TextRun({
                        text: line,
                        break: index === 0 ? 0 : 1,
                      })
                  ),

                new TextRun({
                  break: 1,
                }),
              ],
            });
          }),
        },

        ...Object.entries(data.riskAreas).reduce(
          (acc, [key, value]) => ({
            ...acc,
            [`riskAreas_${key}`]: {
              type: PatchType.DOCUMENT,
              children: value.map((text) => {
                return new Paragraph({
                  spacing: {
                    before: 300,
                    after: 300,
                  },
                  bullet: {
                    level: 0,
                  },

                  children: [
                    ...text
                      .trim()
                      .split(/\n+/)
                      .map(
                        (line, index) =>
                          new TextRun({
                            text: line,
                            break: index === 0 ? 0 : 1,
                          })
                      ),

                    new TextRun({
                      break: 1,
                    }),
                  ],
                });
              }),
            },
          }),
          {}
        ),

        annexure: {
          type: PatchType.DOCUMENT,
          children:
            data.annexure.length > 0
              ? data.annexure.map(annexureTable).flat()
              : noAnnexure(),
        },

        a_rating: highlightRating(data.riskData[0].rating),
        b_rating: highlightRating(data.riskData[1].rating),
        c_rating: highlightRating(data.riskData[2].rating),
        d_rating: highlightRating(data.riskData[3].rating),
        e_rating: highlightRating(data.riskData[4].rating),
        f_rating: highlightRating(data.riskData[5].rating),

        ...(!disableRegulatoryAndLegal && {
          g_rating: highlightRating(data.riskData[6].rating),
          regularity_findings: {
            type: PatchType.DOCUMENT,
            children: data.reg_findings
              ? data.reg_data.map(createFindingsTable).flat()
              : createNoHitsTable('REGULATORY'),
          },
          legal_findings: {
            type: PatchType.DOCUMENT,
            children: data.bankruptcy_findings
              ? data.leg_data.map(createFindingsTable).flat()
              : createNoHitsTable('LEGAL'),
          },
        }),

        // Utils
        page_break: {
          type: PatchType.DOCUMENT,
          children: [new Paragraph({ pageBreakBefore: true })],
        },

        // Findings Content
        sanctions_findings: {
          type: PatchType.DOCUMENT,
          children: data.sanctions_findings
            ? data.sape_data.map(createFindingsTable).flat()
            : createNoHitsTable('SANCTIONS'),
        },

        antiBribery_findings: {
          type: PatchType.DOCUMENT,
          children: data.bribery_findings
            ? data.bribery_data.map(createFindingsTable).flat()
            : createNoHitsTable('ANTI-BRIBERY AND ANTI-CORRUPTION'),
        },

        government_ownership_and_political_affiliations_findings: {
          type: PatchType.DOCUMENT,
          children: data.sown_findings
            ? data.sown_data.map(createFindingsTable).flat()
            : createNoHitsTable(
                'GOVERNMENT OWNERSHIP AND POLITICAL AFFILIATIONS'
              ),
        },

        financial_indicators_findings: {
          type: PatchType.DOCUMENT,
          children:
            data.financial_findings.data.length > 0
              ? createFindingsInnerTable(data.financial_findings)
              : createNoHitsTable('FINANCIALS'),
        },
        bankruptcy_findings: {
          type: PatchType.DOCUMENT,
          children: data.bankruptcy_findings
            ? data.backruptcy_data.map(createFindingsTable).flat()
            : createNoHitsTable('BANKRUPTCY'),
        },
        other_adverse_media_findings: {
          type: PatchType.DOCUMENT,
          children: data.adv_findings
            ? data.adv_data.map(createFindingsTable).flat()
            : createNoHitsTable('OTHER ADVERSE MEDIA'),
        },

        web_findings: {
          type: PatchType.DOCUMENT,
          children:
            data.web_findings.data.length > 0
              ? data.web_findings.data.map(createFindingsTable).flat()
              : [],
        },

        cyberSecurity_findings: {
          type: PatchType.DOCUMENT,
          children:
            data.cyberSecurity_findings.data.length > 0
              ? createFindingsInnerTable(data.cyberSecurity_findings)
              : createNoHitsTable('CYBER SECURITY'),
        },
        esg_findings: {
          type: PatchType.DOCUMENT,
          children:
            data.esg_findings.data.length > 0
              ? createFindingsInnerTable(data.esg_findings)
              : createNoHitsTable('ESG'),
        },
      },
    });

    const fileName = `${data.name}`;

    const docxPath = `src/${fileName}.docx`;
    const pdfPath = `src/${fileName}.pdf`;

    fs.writeFileSync(docxPath, doc);

    topdf.convert(docxPath, pdfPath);

    await Promise.all([
      uploadToAzure(
        docxPath,
        `${data.ens_id}/${fileName}.docx`,
        data.session_id
      ),
      uploadToAzure(pdfPath, `${data.ens_id}/${fileName}.pdf`, data.session_id),
    ]);

    // Cleanup local files after upload
    await Promise.all([
      fs.promises.unlink(docxPath),
      fs.promises.unlink(pdfPath),
    ]);
  } catch (error) {
    console.error('Error generating report:', error);
    throw new Error('Report generation failed');
  }
};
