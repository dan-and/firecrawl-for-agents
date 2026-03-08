import { Application } from "express";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import redoc from "redoc-express";

const options = {
  failOnErrors: true,
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Firecrawl API",
      description:
        "Self-hostable web scraping and crawling API.\n\n" +
        "**Core:** Single-page scrape, bulk scrape (list of URLs), recursive crawl (follow links with maxDepth/maxPages), and site mapping (discover URLs without scraping content).\n\n" +
        "**Document formats → HTML/Markdown:** PDF (text extraction via unpdf), Word (DOCX via mammoth, legacy .doc via word-extractor), spreadsheets (XLSX, XLS, ODS via SheetJS → HTML tables), and office/presentations (PPTX, ODT, ODP, RTF via officeparser). All are converted to HTML then to Markdown in the same pipeline as web pages.\n\n" +
        "**Scraping engines:** Plain HTTP (fetch), CycleTLS (anti-bot), and Hero browser (JS-heavy pages); automatic fallback by tier. Optional browser actions (click, type, scroll, wait, screenshot) when Hero is configured. Google Docs/Sheets/Drive URLs can be rewritten for direct HTML export.\n\n" +
        "**Output options:** Markdown, HTML, raw HTML, links extraction, screenshots; onlyMainContent (main article only); optional onlyCleanContent (LLM-powered cleaning via gpt-4o-mini when OPENAI_API_KEY is set).",
      version: "1.0.0",
    },
    servers: [
      {
        url: "/",
        description: "This server",
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
        },
      },
    },
  },
  apis: ["./src/controllers/v1/*.ts"],
};

export function setupOpenAPI(app: Application) {
  const openapiSpecification = swaggerJsdoc(options);

  app.get("/api-docs/openapi.json", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(openapiSpecification);
  });

  app.use(
    "/docs",
    swaggerUi.serve,
    swaggerUi.setup(openapiSpecification, {
      swaggerOptions: {
        tryItOutEnabled: true,
        persistAuthorization: true,
      },
      customSiteTitle: "Firecrawl API Docs",
    })
  );

  app.get(
    "/redoc",
    redoc({
      title: "Firecrawl API Docs",
      specUrl: "/api-docs/openapi.json",
      nonce: "",
      redocOptions: {},
    })
  );

  app.get("/", (req, res) => {
    res.redirect("/docs");
  });
}
