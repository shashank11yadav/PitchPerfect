const MINUTE = 60;
const KIB = 1024;
const MIB = KIB * KIB;

/** Every numeric limit shared across services. Units are in the key name where not obvious. */
export const LIMITS = {
  // Practice sessions
  turnMinChars: 1,
  turnMaxChars: 1000,
  maxStudentTurns: 20,
  transcriptMaxEntries: 40,
  transcriptEntryMaxLength: 2000,
  sessionSeconds: 20 * MINUTE,
  replyMaxWords: 80,
  guardFlagLimit: 3,
  dailyQuota: 5,
  monthlyQuota: 30,
  dailyTokenBudget: 2_000_000,
  attemptRetentionDays: 180,

  // Coach output token caps per call type
  maxTokensReply: 200,
  maxTokensPlan: 600,
  maxTokensScore: 1200,
  maxTokensGuard: 50,

  // Requests and files
  resumeMaxBytes: 2 * MIB,
  jsonBodyMaxBytes: 100 * KIB,
  urlMaxLength: 2048,
  emailMaxLength: 254,

  // Pagination
  pageSizeDefault: 20,
  pageSizeMax: 50,

  // Accounts and tokens
  passwordMinLength: 12,
  passwordMaxLength: 128,
  tokenMaxLength: 256,
  verifyTokenHours: 24,
  resetTokenMinutes: 30,
  sessionRollingDays: 7,
  sessionAbsoluteDays: 30,

  // Profile fields
  nameMaxLength: 60,
  profileTextMaxLength: 120,
  companyPitchMaxLength: 1000,
  gradYearPast: 1,
  gradYearFuture: 6,

  // Jobs
  jobTitleMinLength: 3,
  jobTitleMaxLength: 120,
  jobLocationMinLength: 2,
  jobLocationMaxLength: 120,
  jobDescriptionMaxChars: 20_000,
  jobSkillsMax: 15,
  jobSkillMaxLength: 40,
  jobSearchMaxLength: 100,
  payMax: 10_000_000,

  // Scenario and scorecard text
  personaNameMaxLength: 60,
  personaTextMaxLength: 200,
  openingLineMaxLength: 600,
  scenarioListMaxItemLength: 200,
  hiddenObjectionsMin: 2,
  hiddenObjectionsMax: 3,
  winConditionsMin: 1,
  winConditionsMax: 3,
  justificationMaxLength: 240,
  evidenceMaxLength: 160,
  scorecardListItemMaxLength: 160,
  scorecardListSize: 3,
  modelNameMaxLength: 100,
} as const;
