import { RUBRIC_DIMENSIONS } from "@pitchperfect/shared";
import { EvidenceExplorerClient, type EvidenceRow } from "./EvidenceExplorerClient";
import {
  SAMPLE_PERSONA,
  SAMPLE_SCORECARD,
  SAMPLE_SKILL_TITLE,
  SAMPLE_TRANSCRIPT,
  SAMPLE_WEIGHTED,
} from "./sample-session";

const byKey = new Map(SAMPLE_SCORECARD.dimensions.map((dimension) => [dimension.key, dimension]));
const ROWS: EvidenceRow[] = RUBRIC_DIMENSIONS.flatMap(({ key, name }) => {
  const dimension = byKey.get(key);
  return dimension ? [{ ...dimension, name }] : [];
});

/**
 * The sample session, prepared on the server and handed to the interactive part as plain data,
 * so the shared package (and its schema library) stays out of the browser bundle.
 */
export function EvidenceExplorer() {
  return (
    <EvidenceExplorerClient
      rows={ROWS}
      transcript={SAMPLE_TRANSCRIPT}
      personaName={SAMPLE_PERSONA.personaName}
      skillTitle={SAMPLE_SKILL_TITLE}
      overall={SAMPLE_SCORECARD.overall}
      weighted={SAMPLE_WEIGHTED}
    />
  );
}
