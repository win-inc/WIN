/**
 * AUN prototype proxy endpoint for Web HTML.
 * Deploy as a Web app:
 * - Execute as: Me
 * - Who has access: Anyone
 */
function doGet(e) {
  try {
    var targetUrl = (e && e.parameter && e.parameter.url) ? e.parameter.url : "";
    if (!targetUrl) {
      return createJsonResponse_({
        ok: false,
        status: 400,
        message: "Query parameter 'url' is required."
      }, 400);
    }

    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = "https://" + targetUrl;
    }

    var response = UrlFetchApp.fetch(targetUrl, {
      method: "get",
      followRedirects: true,
      muteHttpExceptions: true,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AUN-Prototype-Proxy/1.0)"
      }
    });

    var statusCode = response.getResponseCode();
    var html = response.getContentText("UTF-8");
    var finalUrl = targetUrl;
    var baseUrl = toBaseUrl_(finalUrl);

    return createJsonResponse_({
      ok: statusCode >= 200 && statusCode < 300,
      status: statusCode,
      finalUrl: finalUrl,
      baseUrl: baseUrl,
      html: html,
      message: statusCode >= 200 && statusCode < 300 ? "" : ("Failed to fetch HTML. HTTP " + statusCode)
    }, statusCode);
  } catch (error) {
    return createJsonResponse_({
      ok: false,
      status: 500,
      message: String(error)
    }, 500);
  }
}

/**
 * Optional CORS preflight support.
 */
function doOptions() {
  return createJsonResponse_({ ok: true, status: 200, message: "ok" }, 200);
}

function toBaseUrl_(url) {
  try {
    var u = new URL(url);
    var pathname = u.pathname || "/";
    if (!pathname.endsWith("/")) {
      pathname = pathname.substring(0, pathname.lastIndexOf("/") + 1);
    }
    return u.origin + pathname;
  } catch (error) {
    return url;
  }
}

function createJsonResponse_(data, statusCode) {
  data.statusCode = statusCode;
  var output = ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);

  // In newer runtimes, setHeaders/setHeader may exist.
  // If available, add CORS headers for direct browser fetch.
  if (typeof output.setHeaders === "function") {
    output.setHeaders({
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
  } else if (typeof output.setHeader === "function") {
    output
      .setHeader("Access-Control-Allow-Origin", "*")
      .setHeader("Access-Control-Allow-Methods", "GET, OPTIONS")
      .setHeader("Access-Control-Allow-Headers", "Content-Type");
  }

  return output;
}
