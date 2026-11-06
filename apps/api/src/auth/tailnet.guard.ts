import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC } from "./public.decorator";

export const ALLOWED_LOGIN = Symbol("ALLOWED_TAILSCALE_LOGIN");

interface Request {
  method: string;
  path: string;
  headers: { host?: string };
  header(name: string): string | undefined;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

@Injectable()
export class TailnetGuard implements CanActivate {
  private readonly logger = new Logger(TailnetGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(ALLOWED_LOGIN) private readonly allowedLogin: string,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const login = req.header("tailscale-user-login");
    if (!login || login !== this.allowedLogin) {
      this.logger.warn(
        `Rejected Tailscale login ${JSON.stringify(login ?? "")} on ${req.method} ${req.path}`,
      );
      throw new UnauthorizedException();
    }

    if (!SAFE_METHODS.has(req.method) && !originMatchesHost(req)) {
      this.logger.warn(
        `Rejected cross-site ${req.method} ${req.path} from origin ${JSON.stringify(req.header("origin"))}`,
      );
      throw new ForbiddenException();
    }
    return true;
  }
}

// nginx forwards the browser's Host, so the app's own address is the Host header.
function originMatchesHost(req: Request): boolean {
  const origin = req.header("origin");
  if (origin === undefined) return true;
  try {
    return (
      new URL(origin).hostname ===
      new URL(`http://${req.headers.host}`).hostname
    );
  } catch {
    return false;
  }
}
