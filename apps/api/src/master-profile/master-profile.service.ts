import { createHash } from "node:crypto";
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { type Profile, validateProfile } from "master-profile";
import { PrismaService } from "../prisma/prisma.service";
import { ImportResultDto } from "./master-profile.dto";

type EntryStates = Map<string, boolean>;

// Entry ID to retired. Do-not-claims have no retired flag and never retire.
function entryStates(profile: Profile): EntryStates {
  const states: EntryStates = new Map();
  for (const entry of [
    ...profile.experiences,
    ...profile.facts,
    ...profile.projects,
    ...profile.education,
    ...profile.skills,
  ])
    states.set(entry.id, entry.retired);
  for (const entry of profile.do_not_claims) states.set(entry.id, false);
  return states;
}

@Injectable()
export class MasterProfileService {
  private readonly logger = new Logger(MasterProfileService.name);

  constructor(private readonly prisma: PrismaService) {}

  async import(yaml: string): Promise<ImportResultDto> {
    // The errors can quote the file, so they go to the caller and never to the log.
    const result = validateProfile(yaml);
    if (!result.ok) throw new BadRequestException({ errors: result.errors });
    const states = entryStates(result.profile);
    if (states.size === 0)
      throw new BadRequestException({
        errors: [{ id: "(file)", message: "the file has 0 Entries" }],
      });

    const version = createHash("sha256").update(yaml).digest("hex");
    const previous = await this.latestStates();
    const base = {
      version,
      read: states.size,
      added: [...states.keys()].filter((id) => !previous.has(id)).length,
      retired: [...states].filter(([id, r]) => r && previous.get(id) === false)
        .length,
    };

    if (
      await this.prisma.masterProfileVersion.findUnique({
        where: { id: version },
      })
    )
      return { ...base, created: false, added: 0, retired: 0 };

    const missing = [...previous.keys()].filter((id) => !states.has(id));
    if (missing.length)
      throw new BadRequestException({
        errors: missing.map((id) => ({
          id,
          message: `${id} is missing; an Entry leaves the profile only by retired: true`,
        })),
      });

    try {
      await this.prisma.masterProfileVersion.create({
        data: { id: version, rawYaml: yaml },
      });
    } catch (error) {
      // A concurrent import of the same file won the insert.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        return { ...base, created: false, added: 0, retired: 0 };
      throw error;
    }
    this.logger.log(`Stored Master profile version ${version.slice(0, 12)}`);
    return { ...base, created: true };
  }

  private async latestStates(): Promise<EntryStates> {
    const latest = await this.prisma.masterProfileVersion.findFirst({
      orderBy: { createdAt: "desc" },
    });
    if (!latest) return new Map();
    const result = validateProfile(latest.rawYaml);
    if (!result.ok) {
      this.logger.error(
        `Latest Master profile version ${latest.id.slice(0, 12)} no longer validates`,
      );
      throw new InternalServerErrorException();
    }
    return entryStates(result.profile);
  }
}
