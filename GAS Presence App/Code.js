const spreadsheet_id = "1XVkpUBCZ3tWWuiY6o7zE_2R7tKUSSBfAXYweBjtWdes";
const tokens = "tokens";
const presence = "presence";
const accelerometer = "accelerometer";
const gps_sheet = "gps";

function doPost(e) {
  try { 
    const path = e.parameter.path || "";
    const body = JSON.parse(e.postData.contents);

    if (path === "presence/qr/generate") return generateQR(body);
    if (path === "presence/checkin") return checkIn(body);
    if (path === "telemetry/accel") return postAccel(body);
    if (path === "telemetry/gps") return postGps(body);

    return jsonResponse(false, null, "endpoint_not_found");
  } catch (error) {
    return jsonResponse(false, null, "server_error: " + error.message);
  }
}

function doGet(e) {
  const path = e.parameter.path || "";
  const page = e.parameter.page || "";

  // presence
  if (path === "presence/status") return checkStatus(e.parameter);

  // accelerometry
  if (path === "telemetry/accel/latest") return getLatestAccel(e.parameter);

  // GPS
  if (path === "telemetry/gps/latest") return getLatestGps(e.parameter);
  if (path === "telemetry/gps/history") return getGpsHistory(e.parameter);

  if (page === "scan") {
    return HtmlService
      .createHtmlOutputFromFile("scan")
      .setTitle("QR Attendance Scanner")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  if (!path) {
    return HtmlService
      .createHtmlOutputFromFile("index")
      .setTitle("Presence System");
  }

  return jsonResponse(false, null, "endpoint_not_found");
}

function jsonResponse(ok, data = null, error = null) {
  return ContentService
    .createTextOutput(JSON.stringify(
      ok ? { ok: true, data } : { ok: false, error }
    ))
    .setMimeType(ContentService.MimeType.JSON);
}

// ==========================================
// FITUR PRESENSI (QR)
// ==========================================

function generateQR(body) {
  const { course_id, session_id, timestamp } = body;

  if (!course_id || !session_id || !timestamp)
    return jsonResponse(false, null, "missing_field");

  const qrToken = "TKN-" + Math.random().toString(36).substring(2, 8).toUpperCase();

  const now = new Date();
  const expires_at = new Date(now.getTime() + 30000).toISOString();
  const sheet = SpreadsheetApp.openById(spreadsheet_id).getSheetByName(tokens);

  sheet.appendRow([
    qrToken,
    session_id,
    course_id,
    expires_at,
    timestamp || now.toISOString()
  ]);

  return jsonResponse(true, {
    qr_token: qrToken,
    session_id: session_id,
    course_id: course_id,
    expires_at: expires_at
  });
}

function generateQRFromClient(courseId, sessionId) {
  if (!courseId || !sessionId)
    return { ok: false, error: "missing_field" };

  const qrToken = "TKN-" + Math.random().toString(36).substring(2, 8).toUpperCase();
  const now = new Date();
  const expires_at = new Date(now.getTime() + 30000).toISOString();
  const sheet = SpreadsheetApp.openById(spreadsheet_id).getSheetByName(tokens);

  sheet.appendRow([
    qrToken,
    sessionId,
    courseId,
    expires_at,
    now.toISOString()
  ]);

  return {
    ok: true,
    data: {
      qr_token: qrToken,
      session_id: sessionId,
      course_id: courseId,
      expires_at: expires_at
    }
  };
}

function checkIn(body) {
  const { user_id, device_id, qr_token, timestamp } = body;

  if (!user_id || !device_id || !qr_token || !timestamp)
    return jsonResponse(false, null, "missing_field");

  const ss = SpreadsheetApp.openById(spreadsheet_id);
  const tokenSheet = ss.getSheetByName(tokens);
  const presenceSheet = ss.getSheetByName(presence);

  const tokensData = tokenSheet.getDataRange().getValues();

  let tokenData = null;

  for (let i = 1; i < tokensData.length; i++) {
    if (tokensData[i][0] === qr_token) {
      tokenData = tokensData[i];
      break;
    }
  }

  if (!tokenData)
    return jsonResponse(false, null, "token_invalid");

  const expiresAt = new Date(tokenData[3]);
  const now = new Date();

  if (now > expiresAt)
    return jsonResponse(false, null, "token_expired");

  const course_id = tokenData[2];
  const session_id = tokenData[1];

  const presences = presenceSheet.getDataRange().getValues();

  for (let i = 1; i < presences.length; i++) {
    if (
      presences[i][2] === user_id &&
      presences[i][4] === course_id &&
      presences[i][1] === session_id
    ) {
      return jsonResponse(false, null, "already_checked_in");
    }
  }

  const presenceId = "HDR-" + Utilities.getUuid().substring(0, 8);

  presenceSheet.appendRow([
    presenceId,
    session_id,
    user_id,
    device_id,
    course_id,
    qr_token,
    timestamp
  ]);

  return jsonResponse(true, {
    presence_id: presenceId,
    course_id: course_id,
    session_id: session_id,
    status: "checked_in"
  });
}

function checkStatus(params) {
  const { user_id, course_id, session_id } = params;

  if (!user_id || !course_id || !session_id)
    return jsonResponse(false, null, "missing_field");

  const sheet = SpreadsheetApp.openById(spreadsheet_id)
    .getSheetByName(presence);

  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const rowUser = String(data[i][2]).trim();
    const rowCourse = String(data[i][4]).trim();
    const rowSession = String(data[i][1]).trim();

    if (
      rowUser === String(user_id).trim() &&
      rowCourse === String(course_id).trim() &&
      rowSession === String(session_id).trim()
    ) {
      return jsonResponse(true, {
        user_id,
        course_id,
        session_id,
        status: "checked_in",
        last_timestamp: data[i][6]
      });
    }
  }

  return jsonResponse(true, {
    user_id,
    course_id,
    session_id,
    status: "not_checked_in"
  });
}

// ==========================================
// FITUR TELEMETRI (ACCELEROMETER)
// ==========================================

function getLatestAccel(params) {
  const { device_id } = params;

  if (!device_id)
    return jsonResponse(false, null, "missing_field: device_id");

  const sheet = SpreadsheetApp
    .openById(spreadsheet_id)
    .getSheetByName(accelerometer);

  const data = sheet.getDataRange().getValues();

  for (let i = data.length - 1; i > 0; i--) {
    if (String(data[i][0]).trim() === String(device_id).trim()) {
      return jsonResponse(true, {
        t: data[i][1],
        x: data[i][2],
        y: data[i][3],
        z: data[i][4]
      });
    }
  }

  return jsonResponse(false, null, "device_not_found");
}

function postAccel(body) {
  const { device_id, ts, samples } = body;

  if (!device_id)
    return jsonResponse(false, null, "missing_field: device_id");

  if (!samples || !Array.isArray(samples))
    return jsonResponse(false, null, "missing_field: samples");

  const sheet = SpreadsheetApp
    .openById(spreadsheet_id)
    .getSheetByName(accelerometer);

  const serverTs = new Date().toISOString();
  let accepted = 0;

  samples.forEach(sample => {
    if (sample.t && sample.x != null && sample.y != null && sample.z != null) {
      sheet.appendRow([
        device_id,
        sample.t,
        sample.x,
        sample.y,
        sample.z,
        serverTs
      ]);
      accepted++;
    }
  });

  return jsonResponse(true, { accepted });
}


// ==========================================
// FITUR BARU: MODUL 3 (GPS)
// ==========================================

// 1. Log GPS Point (POST)
function postGps(body) {
  const { device_id, ts, lat, lng, accuracy_m } = body;

  if (!device_id || lat === undefined || lng === undefined) {
    return jsonResponse(false, null, "missing_field: device_id, lat, or lng");
  }

  const sheet = SpreadsheetApp.openById(spreadsheet_id).getSheetByName(gps_sheet);
  if (!sheet) return jsonResponse(false, null, "sheet_not_found: gps");

  const timestamp = ts || new Date().toISOString();
  const serverTs = new Date().toISOString();

  sheet.appendRow([
    device_id,
    timestamp,
    lat,
    lng,
    accuracy_m || "",
    serverTs
  ]);

  return jsonResponse(true, { accepted: true });
}

// 2. Ambil GPS Terbaru / Marker (GET)
function getLatestGps(params) {
  const { device_id } = params;

  if (!device_id) return jsonResponse(false, null, "missing_field: device_id");

  const sheet = SpreadsheetApp.openById(spreadsheet_id).getSheetByName(gps_sheet);
  if (!sheet) return jsonResponse(false, null, "sheet_not_found: gps");

  const data = sheet.getDataRange().getValues();

  // Cari data dari bawah (paling baru)
  for (let i = data.length - 1; i > 0; i--) {
    if (String(data[i][0]).trim() === String(device_id).trim()) {
      return jsonResponse(true, {
        ts: data[i][1],
        lat: parseFloat(data[i][2]),
        lng: parseFloat(data[i][3]),
        accuracy_m: data[i][4] ? parseFloat(data[i][4]) : null
      });
    }
  }

  return jsonResponse(false, null, "device_not_found");
}

// 3. Ambil GPS History / Polyline (GET)
function getGpsHistory(params) {
  const { device_id, limit } = params;

  if (!device_id) return jsonResponse(false, null, "missing_field: device_id");

  const maxLimit = limit ? parseInt(limit) : 200; // Default limit 200 titik
  const sheet = SpreadsheetApp.openById(spreadsheet_id).getSheetByName(gps_sheet);
  if (!sheet) return jsonResponse(false, null, "sheet_not_found: gps");

  const data = sheet.getDataRange().getValues();
  let items = [];

  // Ambil data dari bawah (paling baru), dibatasi oleh maxLimit
  for (let i = data.length - 1; i > 0; i--) {
    if (String(data[i][0]).trim() === String(device_id).trim()) {
      items.push({
        ts: data[i][1],
        lat: parseFloat(data[i][2]),
        lng: parseFloat(data[i][3])
      });
      if (items.length >= maxLimit) break;
    }
  }

  // Penting: Balikkan array agar data terurut dari yang Paling Lama -> Paling Baru (Untuk menggambar jejak rute/polyline yang benar)
  items.reverse();

  return jsonResponse(true, {
    device_id: device_id,
    items: items
  });
}