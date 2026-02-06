// =============================================================================
// MOSY — Azure Functions Entry Point
// Registers all function handlers with the Azure Functions v4 runtime.
// =============================================================================

import './functions/processTelemetry.js';
import './functions/processAlert.js';
import './functions/generateShiftReport.js';
import './functions/getFleetStatus.js';
import './functions/getCraneDetail.js';
import './functions/getOperatorHistory.js';
import './functions/negotiate.js';
import './functions/broadcastUpdate.js';
