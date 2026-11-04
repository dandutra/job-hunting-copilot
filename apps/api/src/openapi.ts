import { INestApplication } from "@nestjs/common";
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from "@nestjs/swagger";

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle("Job hunting copilot API")
    .setVersion("0.1.0")
    .build();
  return SwaggerModule.createDocument(app, config);
}

// Served only outside production: the spec is committed, so the image has no use for it.
export function serveOpenApi(app: INestApplication): void {
  SwaggerModule.setup("docs", app, buildOpenApiDocument(app));
}
