const spreadsheet_id = "1XVkpUBCZ3tWWuiY6o7zE_2R7tKUSSBfAXYweBjtWdes";
const tokens = "tokens";
const presence = "presence";

function doPost(e) {
  const path = e.parameter.path || "";
  const body = JSON.parse(e.postData.contents);

  if (path === "presence/qr/generate") return generateQR(body);
  if (path === "presence/checkin") return checkIn(body);

  return jsonResponse(false, null, "endpoint_not_found");
}

function doGet(e) {
  const path = e.parameter.path || "";

  if (path === "presence/status") return checkStatus(e.parameter);

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
  const { user_id, device_id, course_id, session_id, qr_token, timestamp } = body;

  if (!user_id || !device_id || !course_id || !session_id || !qr_token || !timestamp)
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

  if (tokenData[2] !== course_id || tokenData[1] !== session_id)
    return jsonResponse(false, null, "token_mismatch");

  const presences = presenceSheet.getDataRange().getValues();

  for (let i = 1; i < presences.length; i++) {
    if (
      presences[i][1] === user_id &&
      presences[i][3] === course_id &&
      presences[i][4] === session_id
    ) {
      return jsonResponse(false, null, "already_checked_in");
    }
  }

  const presenceId = "HDR-" + Utilities.getUuid().substring(0, 8);

  presenceSheet.appendRow([
    presenceId,
    user_id,
    device_id,
    course_id,
    session_id,
    qr_token,
    timestamp
  ]);

  return jsonResponse(true, {
    presence_id: presenceId,
    status: "checked_in"
  });
}

function checkStatus(params) {
  const { user_id, course_id, session_id } = params;

  if (!user_id || !course_id || !session_id)
    return jsonResponse(false, null, "missing_field");

  const sheet = SpreadsheetApp.openById(spreadsheet_id).getSheetByName(presence);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (
      data[i][1] === user_id &&
      data[i][3] === course_id &&
      data[i][4] === session_id
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