"use strict";
var TraceBugModule = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/storage.ts
  function getSessionId() {
    const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "bt_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    return id;
  }
  function getAllSessions() {
    try {
      const raw = localStorage.getItem(SESSIONS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e2) {
      return [];
    }
  }
  function saveSessions(sessions) {
    try {
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    } catch (e2) {
      if (sessions.length > 1) {
        sessions.shift();
        try {
          localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
        } catch (e3) {
        }
      }
    }
  }
  function getCachedSessions() {
    if (!_cachedSessions) {
      _cachedSessions = getAllSessions();
    }
    return _cachedSessions;
  }
  function scheduleFlush() {
    if (_pendingFlush) return;
    _pendingFlush = setTimeout(() => {
      _pendingFlush = null;
      if (_cachedSessions) {
        saveSessions(_cachedSessions);
      }
    }, FLUSH_INTERVAL_MS);
  }
  function flushPendingEvents() {
    if (_pendingFlush) {
      clearTimeout(_pendingFlush);
      _pendingFlush = null;
    }
    if (_cachedSessions) {
      saveSessions(_cachedSessions);
    }
  }
  function invalidateCache() {
    if (_pendingFlush) {
      clearTimeout(_pendingFlush);
      _pendingFlush = null;
    }
    _cachedSessions = null;
  }
  function appendEvent(sessionId, event, maxEvents, maxSessions) {
    let sessions = getCachedSessions();
    let session = sessions.find((s) => s.sessionId === sessionId);
    if (!session) {
      session = {
        sessionId,
        projectId: event.projectId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        errorMessage: null,
        errorStack: null,
        reproSteps: null,
        errorSummary: null,
        events: [],
        annotations: [],
        environment: null
      };
      sessions.push(session);
    }
    session.events.push(event);
    session.updatedAt = Date.now();
    if (session.events.length > maxEvents) {
      session.events = session.events.slice(-maxEvents);
    }
    if (sessions.length > maxSessions) {
      sessions = sessions.slice(-maxSessions);
      _cachedSessions = sessions;
    }
    scheduleFlush();
  }
  function updateSessionError(sessionId, errorMessage, errorStack, reproSteps, errorSummary) {
    const sessions = getCachedSessions();
    const session = sessions.find((s) => s.sessionId === sessionId);
    if (!session) return;
    session.errorMessage = errorMessage;
    session.errorStack = errorStack || null;
    session.reproSteps = reproSteps;
    session.errorSummary = errorSummary;
    session.updatedAt = Date.now();
    scheduleFlush();
  }
  function deleteSession(sessionId) {
    const remaining = getAllSessions().filter((s) => s.sessionId !== sessionId);
    invalidateCache();
    saveSessions(remaining);
  }
  function addAnnotation(sessionId, annotation) {
    const sessions = getCachedSessions();
    const session = sessions.find((s) => s.sessionId === sessionId);
    if (!session) return;
    if (!session.annotations) session.annotations = [];
    session.annotations.push(annotation);
    session.updatedAt = Date.now();
    scheduleFlush();
  }
  function saveEnvironment(sessionId, env) {
    const sessions = getCachedSessions();
    const session = sessions.find((s) => s.sessionId === sessionId);
    if (!session) return;
    session.environment = env;
    scheduleFlush();
  }
  function clearAllSessions() {
    invalidateCache();
    try {
      localStorage.removeItem(SESSIONS_KEY);
    } catch (e2) {
    }
  }
  var SESSIONS_KEY, _cachedSessions, _pendingFlush, FLUSH_INTERVAL_MS;
  var init_storage = __esm({
    "src/storage.ts"() {
      "use strict";
      SESSIONS_KEY = "tracebug_sessions";
      _cachedSessions = null;
      _pendingFlush = null;
      FLUSH_INTERVAL_MS = 1e3;
      if (typeof window !== "undefined") {
        window.addEventListener("beforeunload", flushPendingEvents);
      }
    }
  });

  // src/repro-generator.ts
  function generateReproSteps(events, errorMessage, errorStack) {
    var _a, _b;
    const steps = [];
    let stepNum = 1;
    let currentPage = "";
    let lastStepText = "";
    for (const event of events) {
      switch (event.type) {
        case "route_change": {
          const to = event.data.to || event.page;
          const pageName = friendlyPageName(to);
          steps.push(`${stepNum++}. Navigate to ${pageName} (${to})`);
          currentPage = to;
          break;
        }
        case "click": {
          const el = event.data.element;
          const label = describeElement(el);
          const stepText = `Click ${label}`;
          if (stepText !== lastStepText) {
            steps.push(`${stepNum++}. ${stepText}`);
            lastStepText = stepText;
          }
          break;
        }
        case "input": {
          const inp = event.data.element;
          const fieldName = (inp == null ? void 0 : inp.name) || (inp == null ? void 0 : inp.id) || "field";
          const inputType = (inp == null ? void 0 : inp.type) || "text";
          if (inputType === "checkbox" || inputType === "radio") {
            steps.push(`${stepNum++}. ${(inp == null ? void 0 : inp.checked) ? "Check" : "Uncheck"} "${fieldName}"`);
          } else {
            const val = inp == null ? void 0 : inp.value;
            if (val && val !== "[REDACTED]" && val.length <= 60) {
              steps.push(`${stepNum++}. Type "${val}" in "${fieldName}" field`);
            } else {
              steps.push(
                `${stepNum++}. Type in "${fieldName}" field (${(inp == null ? void 0 : inp.valueLength) || 0} characters)`
              );
            }
          }
          break;
        }
        case "select_change": {
          const sel = event.data.element;
          const fieldName = (sel == null ? void 0 : sel.name) || (sel == null ? void 0 : sel.id) || "dropdown";
          const selectedText = (sel == null ? void 0 : sel.selectedText) || (sel == null ? void 0 : sel.value) || "unknown";
          steps.push(`${stepNum++}. Select "${selectedText}" from "${fieldName}" dropdown`);
          break;
        }
        case "form_submit": {
          const f2 = event.data.form;
          const formName = (f2 == null ? void 0 : f2.id) || (f2 == null ? void 0 : f2.action) || "form";
          const fieldCount = (f2 == null ? void 0 : f2.fieldCount) || 0;
          steps.push(`${stepNum++}. Submit ${formName} form (${fieldCount} fields)`);
          break;
        }
        case "api_request": {
          const req = event.data.request;
          if ((req == null ? void 0 : req.statusCode) >= 400 || (req == null ? void 0 : req.statusCode) === 0) {
            steps.push(
              `${stepNum++}. API call fails: ${req.method} ${shortenUrl(req.url)} \u2192 ${req.statusCode === 0 ? "Network Error" : `HTTP ${req.statusCode}`}`
            );
          }
          break;
        }
        case "error":
        case "unhandled_rejection": {
          const errMsg = ((_a = event.data.error) == null ? void 0 : _a.message) || errorMessage;
          const stepText = `\u274C Error: "${errMsg}"`;
          if (stepText !== lastStepText) {
            steps.push(`${stepNum++}. ${stepText}`);
            lastStepText = stepText;
          }
          break;
        }
        case "console_error": {
          const msg = ((_b = event.data.error) == null ? void 0 : _b.message) || "";
          if (msg.length > 0 && !msg.includes("Warning:") && !msg.includes("DevTools")) {
            const stepText = `Console error: "${msg.slice(0, 120)}"`;
            if (stepText !== lastStepText) {
              steps.push(`${stepNum++}. ${stepText}`);
              lastStepText = stepText;
            }
          }
          break;
        }
      }
    }
    if (steps.length === 0) {
      steps.push("1. (No user interactions recorded before the error)");
    }
    const summary = buildErrorSummary(errorMessage, errorStack, events);
    return {
      reproSteps: steps.join("\n"),
      errorSummary: summary
    };
  }
  function describeElement(el) {
    if (!el) return "an element";
    const tag = el.tag || "";
    const rawText = (el.text || "").trim();
    const text = rawText.includes("\n") ? rawText.split("\n")[0].trim() : rawText;
    const id = el.id || "";
    const ariaLabel = el.ariaLabel || "";
    if (ariaLabel && ariaLabel.length < 50) {
      return `"${ariaLabel}" ${tag}`;
    }
    if (text && text.length < 50) {
      return `"${text}" ${tag}`;
    }
    if (id) {
      return `#${id} ${tag}`;
    }
    return `a ${tag} element`;
  }
  function friendlyPageName(path) {
    if (path === "/") return "Home page";
    const parts = path.split("/").filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1));
    return parts.join(" ") + " page";
  }
  function shortenUrl(url) {
    try {
      const u2 = new URL(url, window.location.origin);
      return u2.pathname + (u2.search ? "..." : "");
    } catch (e2) {
      return url.slice(0, 60);
    }
  }
  function buildErrorSummary(errorMessage, errorStack, events) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const parts = [];
    parts.push(`Error: ${errorMessage}`);
    if (errorStack) {
      const match = errorStack.match(/at\s+(\S+)\s+\(([^)]+)\)/);
      if (match) {
        parts.push(`Thrown in: ${match[1]} at ${match[2]}`);
      }
    }
    const errorEvents = events.filter(
      (e2) => e2.type === "error" || e2.type === "unhandled_rejection"
    );
    if (errorEvents.length > 0) {
      parts.push(`Page: ${errorEvents[0].page}`);
    }
    const userActions = events.filter(
      (e2) => ["click", "input", "select_change", "form_submit", "route_change"].includes(e2.type)
    );
    if (userActions.length > 0) {
      const last = userActions[userActions.length - 1];
      if (last.type === "click") {
        parts.push(
          `Last action: clicked "${((_a = last.data.element) == null ? void 0 : _a.text) || ((_b = last.data.element) == null ? void 0 : _b.id) || "element"}"`
        );
      } else if (last.type === "input") {
        const val = (_c = last.data.element) == null ? void 0 : _c.value;
        if (val && val !== "[REDACTED]") {
          parts.push(`Last action: typed "${val}" in "${((_d = last.data.element) == null ? void 0 : _d.name) || "field"}"`);
        } else {
          parts.push(`Last action: typed in "${((_e = last.data.element) == null ? void 0 : _e.name) || "field"}"`);
        }
      } else if (last.type === "select_change") {
        parts.push(`Last action: selected "${(_f = last.data.element) == null ? void 0 : _f.selectedText}" from "${((_g = last.data.element) == null ? void 0 : _g.name) || "dropdown"}"`);
      } else if (last.type === "form_submit") {
        parts.push(`Last action: submitted form "${((_h = last.data.form) == null ? void 0 : _h.id) || ""}"`);
      }
    }
    return parts.join("\n");
  }
  var init_repro_generator = __esm({
    "src/repro-generator.ts"() {
      "use strict";
    }
  });

  // node_modules/html2canvas/dist/html2canvas.esm.js
  var html2canvas_esm_exports = {};
  __export(html2canvas_esm_exports, {
    default: () => html2canvas_esm_default
  });
  function __extends(d, b) {
    if (typeof b !== "function" && b !== null)
      throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
    extendStatics(d, b);
    function __() {
      this.constructor = d;
    }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
  }
  function __awaiter(thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P ? value : new P(function(resolve) {
        resolve(value);
      });
    }
    return new (P || (P = Promise))(function(resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e2) {
          reject(e2);
        }
      }
      function rejected(value) {
        try {
          step(generator["throw"](value));
        } catch (e2) {
          reject(e2);
        }
      }
      function step(result) {
        result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  }
  function __generator(thisArg, body) {
    var _ = { label: 0, sent: function() {
      if (t[0] & 1) throw t[1];
      return t[1];
    }, trys: [], ops: [] }, f2, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() {
      return this;
    }), g;
    function verb(n) {
      return function(v) {
        return step([n, v]);
      };
    }
    function step(op) {
      if (f2) throw new TypeError("Generator is already executing.");
      while (_) try {
        if (f2 = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
        if (y = 0, t) op = [op[0] & 2, t.value];
        switch (op[0]) {
          case 0:
          case 1:
            t = op;
            break;
          case 4:
            _.label++;
            return { value: op[1], done: false };
          case 5:
            _.label++;
            y = op[1];
            op = [0];
            continue;
          case 7:
            op = _.ops.pop();
            _.trys.pop();
            continue;
          default:
            if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
              _ = 0;
              continue;
            }
            if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
              _.label = op[1];
              break;
            }
            if (op[0] === 6 && _.label < t[1]) {
              _.label = t[1];
              t = op;
              break;
            }
            if (t && _.label < t[2]) {
              _.label = t[2];
              _.ops.push(op);
              break;
            }
            if (t[2]) _.ops.pop();
            _.trys.pop();
            continue;
        }
        op = body.call(thisArg, _);
      } catch (e2) {
        op = [6, e2];
        y = 0;
      } finally {
        f2 = t = 0;
      }
      if (op[0] & 5) throw op[1];
      return { value: op[0] ? op[1] : void 0, done: true };
    }
  }
  function __spreadArray(to, from, pack2) {
    if (pack2 || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
      if (ar || !(i in from)) {
        if (!ar) ar = Array.prototype.slice.call(from, 0, i);
        ar[i] = from[i];
      }
    }
    return to.concat(ar || from);
  }
  function hue2rgb(t1, t2, hue) {
    if (hue < 0) {
      hue += 1;
    }
    if (hue >= 1) {
      hue -= 1;
    }
    if (hue < 1 / 6) {
      return (t2 - t1) * hue * 6 + t1;
    } else if (hue < 1 / 2) {
      return t2;
    } else if (hue < 2 / 3) {
      return (t2 - t1) * 6 * (2 / 3 - hue) + t1;
    } else {
      return t1;
    }
  }
  function isSupportedImage(value) {
    return !(value.type === 20 && value.value === "none") && (value.type !== 18 || !!SUPPORTED_IMAGE_FUNCTIONS[value.name]);
  }
  var extendStatics, __assign, Bounds, parseBounds, parseDocumentSize, toCodePoints$1, fromCodePoint$1, chars$2, lookup$2, i$2, chars$1$1, lookup$1$1, i$1$1, decode$1, polyUint16Array$1, polyUint32Array$1, UTRIE2_SHIFT_2$1, UTRIE2_SHIFT_1$1, UTRIE2_INDEX_SHIFT$1, UTRIE2_SHIFT_1_2$1, UTRIE2_LSCP_INDEX_2_OFFSET$1, UTRIE2_DATA_BLOCK_LENGTH$1, UTRIE2_DATA_MASK$1, UTRIE2_LSCP_INDEX_2_LENGTH$1, UTRIE2_INDEX_2_BMP_LENGTH$1, UTRIE2_UTF8_2B_INDEX_2_OFFSET$1, UTRIE2_UTF8_2B_INDEX_2_LENGTH$1, UTRIE2_INDEX_1_OFFSET$1, UTRIE2_OMITTED_BMP_INDEX_1_LENGTH$1, UTRIE2_INDEX_2_BLOCK_LENGTH$1, UTRIE2_INDEX_2_MASK$1, slice16$1, slice32$1, createTrieFromBase64$1, Trie$1, chars$3, lookup$3, i$3, base64$1, LETTER_NUMBER_MODIFIER, BK, CR$1, LF$1, CM, NL, WJ, ZW, GL, SP, ZWJ$1, B2, BA, BB, HY, CB, CL, CP, EX, IN, NS, OP, QU, IS, NU, PO, PR, SY, AI, AL, CJ, EB, EM, H2, H3, HL, ID, JL, JV, JT, RI$1, SA, XX, ea_OP, BREAK_MANDATORY, BREAK_NOT_ALLOWED$1, BREAK_ALLOWED$1, UnicodeTrie$1, ALPHABETICS, HARD_LINE_BREAKS, SPACE$1, PREFIX_POSTFIX, LINE_BREAKS, KOREAN_SYLLABLE_BLOCK, HYPHEN, codePointsToCharacterClasses, isAdjacentWithSpaceIgnored, previousNonSpaceClassType, _lineBreakAtIndex, cssFormattedClasses, Break, LineBreaker, FLAG_UNRESTRICTED, FLAG_ID, FLAG_INTEGER, FLAG_NUMBER, LINE_FEED, SOLIDUS, REVERSE_SOLIDUS, CHARACTER_TABULATION, SPACE, QUOTATION_MARK, EQUALS_SIGN, NUMBER_SIGN, DOLLAR_SIGN, PERCENTAGE_SIGN, APOSTROPHE, LEFT_PARENTHESIS, RIGHT_PARENTHESIS, LOW_LINE, HYPHEN_MINUS, EXCLAMATION_MARK, LESS_THAN_SIGN, GREATER_THAN_SIGN, COMMERCIAL_AT, LEFT_SQUARE_BRACKET, RIGHT_SQUARE_BRACKET, CIRCUMFLEX_ACCENT, LEFT_CURLY_BRACKET, QUESTION_MARK, RIGHT_CURLY_BRACKET, VERTICAL_LINE, TILDE, CONTROL, REPLACEMENT_CHARACTER, ASTERISK, PLUS_SIGN, COMMA, COLON, SEMICOLON, FULL_STOP, NULL, BACKSPACE, LINE_TABULATION, SHIFT_OUT, INFORMATION_SEPARATOR_ONE, DELETE, EOF, ZERO, a, e, f, u, z, A, E, F, U, Z, isDigit, isSurrogateCodePoint, isHex, isLowerCaseLetter, isUpperCaseLetter, isLetter, isNonASCIICodePoint, isWhiteSpace, isNameStartCodePoint, isNameCodePoint, isNonPrintableCodePoint, isValidEscape, isIdentifierStart, isNumberStart, stringToNumber, LEFT_PARENTHESIS_TOKEN, RIGHT_PARENTHESIS_TOKEN, COMMA_TOKEN, SUFFIX_MATCH_TOKEN, PREFIX_MATCH_TOKEN, COLUMN_TOKEN, DASH_MATCH_TOKEN, INCLUDE_MATCH_TOKEN, LEFT_CURLY_BRACKET_TOKEN, RIGHT_CURLY_BRACKET_TOKEN, SUBSTRING_MATCH_TOKEN, BAD_URL_TOKEN, BAD_STRING_TOKEN, CDO_TOKEN, CDC_TOKEN, COLON_TOKEN, SEMICOLON_TOKEN, LEFT_SQUARE_BRACKET_TOKEN, RIGHT_SQUARE_BRACKET_TOKEN, WHITESPACE_TOKEN, EOF_TOKEN, Tokenizer, Parser, isDimensionToken, isNumberToken, isIdentToken, isStringToken, isIdentWithValue, nonWhiteSpace, nonFunctionArgSeparator, parseFunctionArgs, isEndingTokenFor, isLength, isLengthPercentage, parseLengthPercentageTuple, ZERO_LENGTH, FIFTY_PERCENT, HUNDRED_PERCENT, getAbsoluteValueForTuple, getAbsoluteValue, DEG, GRAD, RAD, TURN, angle, isAngle, parseNamedSide, deg, color$1, isTransparent, asString, pack, getTokenColorValue, rgb, hsl, SUPPORTED_COLOR_FUNCTIONS, parseColor, COLORS, backgroundClip, backgroundColor, parseColorStop, processColorStops, getAngleFromCorner, calculateGradientDirection, distance, findCorner, calculateRadius, linearGradient, prefixLinearGradient, webkitGradient, CLOSEST_SIDE, FARTHEST_SIDE, CLOSEST_CORNER, FARTHEST_CORNER, CIRCLE, ELLIPSE, COVER, CONTAIN, radialGradient, prefixRadialGradient, isLinearGradient, isRadialGradient, image, SUPPORTED_IMAGE_FUNCTIONS, backgroundImage, backgroundOrigin, backgroundPosition, backgroundRepeat, parseBackgroundRepeat, BACKGROUND_SIZE, backgroundSize, isBackgroundSizeInfoToken, borderColorForSide, borderTopColor, borderRightColor, borderBottomColor, borderLeftColor, borderRadiusForSide, borderTopLeftRadius, borderTopRightRadius, borderBottomRightRadius, borderBottomLeftRadius, borderStyleForSide, borderTopStyle, borderRightStyle, borderBottomStyle, borderLeftStyle, borderWidthForSide, borderTopWidth, borderRightWidth, borderBottomWidth, borderLeftWidth, color, direction, display, parseDisplayValue, float, letterSpacing, LINE_BREAK, lineBreak, lineHeight, computeLineHeight, listStyleImage, listStylePosition, listStyleType, marginForSide, marginTop, marginRight, marginBottom, marginLeft, overflow, overflowWrap, paddingForSide, paddingTop, paddingRight, paddingBottom, paddingLeft, textAlign, position, textShadow, textTransform, transform$1, matrix, matrix3d, SUPPORTED_TRANSFORM_FUNCTIONS, DEFAULT_VALUE, DEFAULT, transformOrigin, visibility, WORD_BREAK, wordBreak, zIndex, time, opacity, textDecorationColor, textDecorationLine, fontFamily, fontSize, fontWeight, fontVariant, fontStyle, contains, content, counterIncrement, counterReset, duration, quotes, getQuote, boxShadow, paintOrder, webkitTextStrokeColor, webkitTextStrokeWidth, CSSParsedDeclaration, CSSParsedPseudoDeclaration, CSSParsedCounterDeclaration, parse, elementDebuggerAttribute, getElementDebugType, isDebugging, ElementContainer, base64, chars$1, lookup$1, i$1, decode, polyUint16Array, polyUint32Array, UTRIE2_SHIFT_2, UTRIE2_SHIFT_1, UTRIE2_INDEX_SHIFT, UTRIE2_SHIFT_1_2, UTRIE2_LSCP_INDEX_2_OFFSET, UTRIE2_DATA_BLOCK_LENGTH, UTRIE2_DATA_MASK, UTRIE2_LSCP_INDEX_2_LENGTH, UTRIE2_INDEX_2_BMP_LENGTH, UTRIE2_UTF8_2B_INDEX_2_OFFSET, UTRIE2_UTF8_2B_INDEX_2_LENGTH, UTRIE2_INDEX_1_OFFSET, UTRIE2_OMITTED_BMP_INDEX_1_LENGTH, UTRIE2_INDEX_2_BLOCK_LENGTH, UTRIE2_INDEX_2_MASK, slice16, slice32, createTrieFromBase64, Trie, chars, lookup, i, Prepend, CR, LF, Control, Extend, SpacingMark, L, V, T, LV, LVT, ZWJ, Extended_Pictographic, RI, toCodePoints, fromCodePoint, UnicodeTrie, BREAK_NOT_ALLOWED, BREAK_ALLOWED, codePointToClass, _graphemeBreakAtIndex, GraphemeBreaker, splitGraphemes, testRangeBounds, testIOSLineBreak, testCORS, testResponseType, testSVG, isGreenPixel, testForeignObject, createForeignObjectSVG, loadSerializedSVG$1, FEATURES, TextBounds, parseTextBounds, getWrapperBounds, createRange, segmentGraphemes, segmentWords, breakText, wordSeparators, breakWords, TextContainer, transform, CAPITALIZE, capitalize, ImageElementContainer, CanvasElementContainer, SVGElementContainer, LIElementContainer, OLElementContainer, CHECKBOX_BORDER_RADIUS, RADIO_BORDER_RADIUS, reformatInputBounds, getInputValue, CHECKBOX, RADIO, PASSWORD, INPUT_COLOR, InputElementContainer, SelectElementContainer, TextareaElementContainer, IFrameElementContainer, LIST_OWNERS, parseNodeTree, createContainer, parseTree, createsRealStackingContext, createsStackingContext, isTextNode, isElementNode, isHTMLElementNode, isSVGElementNode, isLIElement, isOLElement, isInputElement, isHTMLElement, isSVGElement, isBodyElement, isCanvasElement, isVideoElement, isImageElement, isIFrameElement, isStyleElement, isScriptElement, isTextareaElement, isSelectElement, isSlotElement, isCustomElement, CounterState, ROMAN_UPPER, ARMENIAN, HEBREW, GEORGIAN, createAdditiveCounter, createCounterStyleWithSymbolResolver, createCounterStyleFromRange, createCounterStyleFromSymbols, CJK_ZEROS, CJK_TEN_COEFFICIENTS, CJK_TEN_HIGH_COEFFICIENTS, CJK_HUNDRED_COEFFICIENTS, createCJKCounter, CHINESE_INFORMAL_MULTIPLIERS, CHINESE_FORMAL_MULTIPLIERS, JAPANESE_NEGATIVE, KOREAN_NEGATIVE, createCounterText, IGNORE_ATTRIBUTE, DocumentCloner, PseudoElementType, createIFrameContainer, imageReady, imagesReady, iframeLoader, ignoredStyleProperties, copyCSSStyles, serializeDoctype, restoreOwnerScroll, restoreNodeScroll, PSEUDO_BEFORE, PSEUDO_AFTER, PSEUDO_HIDE_ELEMENT_CLASS_BEFORE, PSEUDO_HIDE_ELEMENT_CLASS_AFTER, PSEUDO_HIDE_ELEMENT_STYLE, createPseudoHideStyles, createStyles, CacheStorage, Cache, INLINE_SVG, INLINE_BASE64, INLINE_IMG, isRenderable, isInlineImage, isInlineBase64Image, isBlobImage, isSVG, Vector, lerp, BezierCurve, isBezierCurve, BoundCurves, CORNER, getCurvePoints, calculateBorderBoxPath, calculateContentBoxPath, calculatePaddingBoxPath, TransformEffect, ClipEffect, OpacityEffect, isTransformEffect, isClipEffect, isOpacityEffect, equalPath, transformPath, StackingContext, ElementPaint, parseStackTree, processListItems, parseStackingContexts, parsePathForBorder, parsePathForBorderDoubleOuter, parsePathForBorderDoubleInner, parsePathForBorderStroke, createStrokePathFromCurves, createPathFromCurves, paddingBox, contentBox, calculateBackgroundPositioningArea, calculateBackgroundPaintingArea, calculateBackgroundRendering, isAuto, hasIntrinsicValue, calculateBackgroundSize, getBackgroundValueForIndex, calculateBackgroundRepeatPath, SMALL_IMAGE, SAMPLE_TEXT, FontMetrics, Renderer, MASK_OFFSET, CanvasRenderer, isTextInputElement, calculateBackgroundCurvedPaintingArea, canvasTextAlign, iOSBrokenFonts, fixIOSSystemFonts, ForeignObjectRenderer, loadSerializedSVG, Logger, Context, html2canvas, renderElement, parseBackgroundColor, html2canvas_esm_default;
  var init_html2canvas_esm = __esm({
    "node_modules/html2canvas/dist/html2canvas.esm.js"() {
      "use strict";
      extendStatics = function(d, b) {
        extendStatics = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(d2, b2) {
          d2.__proto__ = b2;
        } || function(d2, b2) {
          for (var p in b2) if (Object.prototype.hasOwnProperty.call(b2, p)) d2[p] = b2[p];
        };
        return extendStatics(d, b);
      };
      __assign = function() {
        __assign = Object.assign || function __assign2(t) {
          for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
          }
          return t;
        };
        return __assign.apply(this, arguments);
      };
      Bounds = /** @class */
      (function() {
        function Bounds2(left, top, width, height) {
          this.left = left;
          this.top = top;
          this.width = width;
          this.height = height;
        }
        Bounds2.prototype.add = function(x, y, w, h) {
          return new Bounds2(this.left + x, this.top + y, this.width + w, this.height + h);
        };
        Bounds2.fromClientRect = function(context, clientRect) {
          return new Bounds2(clientRect.left + context.windowBounds.left, clientRect.top + context.windowBounds.top, clientRect.width, clientRect.height);
        };
        Bounds2.fromDOMRectList = function(context, domRectList) {
          var domRect = Array.from(domRectList).find(function(rect) {
            return rect.width !== 0;
          });
          return domRect ? new Bounds2(domRect.left + context.windowBounds.left, domRect.top + context.windowBounds.top, domRect.width, domRect.height) : Bounds2.EMPTY;
        };
        Bounds2.EMPTY = new Bounds2(0, 0, 0, 0);
        return Bounds2;
      })();
      parseBounds = function(context, node) {
        return Bounds.fromClientRect(context, node.getBoundingClientRect());
      };
      parseDocumentSize = function(document2) {
        var body = document2.body;
        var documentElement = document2.documentElement;
        if (!body || !documentElement) {
          throw new Error("Unable to get document size");
        }
        var width = Math.max(Math.max(body.scrollWidth, documentElement.scrollWidth), Math.max(body.offsetWidth, documentElement.offsetWidth), Math.max(body.clientWidth, documentElement.clientWidth));
        var height = Math.max(Math.max(body.scrollHeight, documentElement.scrollHeight), Math.max(body.offsetHeight, documentElement.offsetHeight), Math.max(body.clientHeight, documentElement.clientHeight));
        return new Bounds(0, 0, width, height);
      };
      toCodePoints$1 = function(str) {
        var codePoints = [];
        var i = 0;
        var length = str.length;
        while (i < length) {
          var value = str.charCodeAt(i++);
          if (value >= 55296 && value <= 56319 && i < length) {
            var extra = str.charCodeAt(i++);
            if ((extra & 64512) === 56320) {
              codePoints.push(((value & 1023) << 10) + (extra & 1023) + 65536);
            } else {
              codePoints.push(value);
              i--;
            }
          } else {
            codePoints.push(value);
          }
        }
        return codePoints;
      };
      fromCodePoint$1 = function() {
        var codePoints = [];
        for (var _i = 0; _i < arguments.length; _i++) {
          codePoints[_i] = arguments[_i];
        }
        if (String.fromCodePoint) {
          return String.fromCodePoint.apply(String, codePoints);
        }
        var length = codePoints.length;
        if (!length) {
          return "";
        }
        var codeUnits = [];
        var index = -1;
        var result = "";
        while (++index < length) {
          var codePoint = codePoints[index];
          if (codePoint <= 65535) {
            codeUnits.push(codePoint);
          } else {
            codePoint -= 65536;
            codeUnits.push((codePoint >> 10) + 55296, codePoint % 1024 + 56320);
          }
          if (index + 1 === length || codeUnits.length > 16384) {
            result += String.fromCharCode.apply(String, codeUnits);
            codeUnits.length = 0;
          }
        }
        return result;
      };
      chars$2 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
      lookup$2 = typeof Uint8Array === "undefined" ? [] : new Uint8Array(256);
      for (i$2 = 0; i$2 < chars$2.length; i$2++) {
        lookup$2[chars$2.charCodeAt(i$2)] = i$2;
      }
      chars$1$1 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
      lookup$1$1 = typeof Uint8Array === "undefined" ? [] : new Uint8Array(256);
      for (i$1$1 = 0; i$1$1 < chars$1$1.length; i$1$1++) {
        lookup$1$1[chars$1$1.charCodeAt(i$1$1)] = i$1$1;
      }
      decode$1 = function(base642) {
        var bufferLength = base642.length * 0.75, len = base642.length, i, p = 0, encoded1, encoded2, encoded3, encoded4;
        if (base642[base642.length - 1] === "=") {
          bufferLength--;
          if (base642[base642.length - 2] === "=") {
            bufferLength--;
          }
        }
        var buffer = typeof ArrayBuffer !== "undefined" && typeof Uint8Array !== "undefined" && typeof Uint8Array.prototype.slice !== "undefined" ? new ArrayBuffer(bufferLength) : new Array(bufferLength);
        var bytes = Array.isArray(buffer) ? buffer : new Uint8Array(buffer);
        for (i = 0; i < len; i += 4) {
          encoded1 = lookup$1$1[base642.charCodeAt(i)];
          encoded2 = lookup$1$1[base642.charCodeAt(i + 1)];
          encoded3 = lookup$1$1[base642.charCodeAt(i + 2)];
          encoded4 = lookup$1$1[base642.charCodeAt(i + 3)];
          bytes[p++] = encoded1 << 2 | encoded2 >> 4;
          bytes[p++] = (encoded2 & 15) << 4 | encoded3 >> 2;
          bytes[p++] = (encoded3 & 3) << 6 | encoded4 & 63;
        }
        return buffer;
      };
      polyUint16Array$1 = function(buffer) {
        var length = buffer.length;
        var bytes = [];
        for (var i = 0; i < length; i += 2) {
          bytes.push(buffer[i + 1] << 8 | buffer[i]);
        }
        return bytes;
      };
      polyUint32Array$1 = function(buffer) {
        var length = buffer.length;
        var bytes = [];
        for (var i = 0; i < length; i += 4) {
          bytes.push(buffer[i + 3] << 24 | buffer[i + 2] << 16 | buffer[i + 1] << 8 | buffer[i]);
        }
        return bytes;
      };
      UTRIE2_SHIFT_2$1 = 5;
      UTRIE2_SHIFT_1$1 = 6 + 5;
      UTRIE2_INDEX_SHIFT$1 = 2;
      UTRIE2_SHIFT_1_2$1 = UTRIE2_SHIFT_1$1 - UTRIE2_SHIFT_2$1;
      UTRIE2_LSCP_INDEX_2_OFFSET$1 = 65536 >> UTRIE2_SHIFT_2$1;
      UTRIE2_DATA_BLOCK_LENGTH$1 = 1 << UTRIE2_SHIFT_2$1;
      UTRIE2_DATA_MASK$1 = UTRIE2_DATA_BLOCK_LENGTH$1 - 1;
      UTRIE2_LSCP_INDEX_2_LENGTH$1 = 1024 >> UTRIE2_SHIFT_2$1;
      UTRIE2_INDEX_2_BMP_LENGTH$1 = UTRIE2_LSCP_INDEX_2_OFFSET$1 + UTRIE2_LSCP_INDEX_2_LENGTH$1;
      UTRIE2_UTF8_2B_INDEX_2_OFFSET$1 = UTRIE2_INDEX_2_BMP_LENGTH$1;
      UTRIE2_UTF8_2B_INDEX_2_LENGTH$1 = 2048 >> 6;
      UTRIE2_INDEX_1_OFFSET$1 = UTRIE2_UTF8_2B_INDEX_2_OFFSET$1 + UTRIE2_UTF8_2B_INDEX_2_LENGTH$1;
      UTRIE2_OMITTED_BMP_INDEX_1_LENGTH$1 = 65536 >> UTRIE2_SHIFT_1$1;
      UTRIE2_INDEX_2_BLOCK_LENGTH$1 = 1 << UTRIE2_SHIFT_1_2$1;
      UTRIE2_INDEX_2_MASK$1 = UTRIE2_INDEX_2_BLOCK_LENGTH$1 - 1;
      slice16$1 = function(view, start, end) {
        if (view.slice) {
          return view.slice(start, end);
        }
        return new Uint16Array(Array.prototype.slice.call(view, start, end));
      };
      slice32$1 = function(view, start, end) {
        if (view.slice) {
          return view.slice(start, end);
        }
        return new Uint32Array(Array.prototype.slice.call(view, start, end));
      };
      createTrieFromBase64$1 = function(base642, _byteLength) {
        var buffer = decode$1(base642);
        var view32 = Array.isArray(buffer) ? polyUint32Array$1(buffer) : new Uint32Array(buffer);
        var view16 = Array.isArray(buffer) ? polyUint16Array$1(buffer) : new Uint16Array(buffer);
        var headerLength = 24;
        var index = slice16$1(view16, headerLength / 2, view32[4] / 2);
        var data = view32[5] === 2 ? slice16$1(view16, (headerLength + view32[4]) / 2) : slice32$1(view32, Math.ceil((headerLength + view32[4]) / 4));
        return new Trie$1(view32[0], view32[1], view32[2], view32[3], index, data);
      };
      Trie$1 = /** @class */
      (function() {
        function Trie2(initialValue, errorValue, highStart, highValueIndex, index, data) {
          this.initialValue = initialValue;
          this.errorValue = errorValue;
          this.highStart = highStart;
          this.highValueIndex = highValueIndex;
          this.index = index;
          this.data = data;
        }
        Trie2.prototype.get = function(codePoint) {
          var ix;
          if (codePoint >= 0) {
            if (codePoint < 55296 || codePoint > 56319 && codePoint <= 65535) {
              ix = this.index[codePoint >> UTRIE2_SHIFT_2$1];
              ix = (ix << UTRIE2_INDEX_SHIFT$1) + (codePoint & UTRIE2_DATA_MASK$1);
              return this.data[ix];
            }
            if (codePoint <= 65535) {
              ix = this.index[UTRIE2_LSCP_INDEX_2_OFFSET$1 + (codePoint - 55296 >> UTRIE2_SHIFT_2$1)];
              ix = (ix << UTRIE2_INDEX_SHIFT$1) + (codePoint & UTRIE2_DATA_MASK$1);
              return this.data[ix];
            }
            if (codePoint < this.highStart) {
              ix = UTRIE2_INDEX_1_OFFSET$1 - UTRIE2_OMITTED_BMP_INDEX_1_LENGTH$1 + (codePoint >> UTRIE2_SHIFT_1$1);
              ix = this.index[ix];
              ix += codePoint >> UTRIE2_SHIFT_2$1 & UTRIE2_INDEX_2_MASK$1;
              ix = this.index[ix];
              ix = (ix << UTRIE2_INDEX_SHIFT$1) + (codePoint & UTRIE2_DATA_MASK$1);
              return this.data[ix];
            }
            if (codePoint <= 1114111) {
              return this.data[this.highValueIndex];
            }
          }
          return this.errorValue;
        };
        return Trie2;
      })();
      chars$3 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
      lookup$3 = typeof Uint8Array === "undefined" ? [] : new Uint8Array(256);
      for (i$3 = 0; i$3 < chars$3.length; i$3++) {
        lookup$3[chars$3.charCodeAt(i$3)] = i$3;
      }
      base64$1 = "KwAAAAAAAAAACA4AUD0AADAgAAACAAAAAAAIABAAGABAAEgAUABYAGAAaABgAGgAYgBqAF8AZwBgAGgAcQB5AHUAfQCFAI0AlQCdAKIAqgCyALoAYABoAGAAaABgAGgAwgDKAGAAaADGAM4A0wDbAOEA6QDxAPkAAQEJAQ8BFwF1AH0AHAEkASwBNAE6AUIBQQFJAVEBWQFhAWgBcAF4ATAAgAGGAY4BlQGXAZ8BpwGvAbUBvQHFAc0B0wHbAeMB6wHxAfkBAQIJAvEBEQIZAiECKQIxAjgCQAJGAk4CVgJeAmQCbAJ0AnwCgQKJApECmQKgAqgCsAK4ArwCxAIwAMwC0wLbAjAA4wLrAvMC+AIAAwcDDwMwABcDHQMlAy0DNQN1AD0DQQNJA0kDSQNRA1EDVwNZA1kDdQB1AGEDdQBpA20DdQN1AHsDdQCBA4kDkQN1AHUAmQOhA3UAdQB1AHUAdQB1AHUAdQB1AHUAdQB1AHUAdQB1AHUAdQB1AKYDrgN1AHUAtgO+A8YDzgPWAxcD3gPjA+sD8wN1AHUA+wMDBAkEdQANBBUEHQQlBCoEFwMyBDgEYABABBcDSARQBFgEYARoBDAAcAQzAXgEgASIBJAEdQCXBHUAnwSnBK4EtgS6BMIEyAR1AHUAdQB1AHUAdQCVANAEYABgAGAAYABgAGAAYABgANgEYADcBOQEYADsBPQE/AQEBQwFFAUcBSQFLAU0BWQEPAVEBUsFUwVbBWAAYgVgAGoFcgV6BYIFigWRBWAAmQWfBaYFYABgAGAAYABgAKoFYACxBbAFuQW6BcEFwQXHBcEFwQXPBdMF2wXjBeoF8gX6BQIGCgYSBhoGIgYqBjIGOgZgAD4GRgZMBmAAUwZaBmAAYABgAGAAYABgAGAAYABgAGAAYABgAGIGYABpBnAGYABgAGAAYABgAGAAYABgAGAAYAB4Bn8GhQZgAGAAYAB1AHcDFQSLBmAAYABgAJMGdQA9A3UAmwajBqsGqwaVALMGuwbDBjAAywbSBtIG1QbSBtIG0gbSBtIG0gbdBuMG6wbzBvsGAwcLBxMHAwcbByMHJwcsBywHMQcsB9IGOAdAB0gHTgfSBkgHVgfSBtIG0gbSBtIG0gbSBtIG0gbSBiwHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAdgAGAALAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAdbB2MHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsB2kH0gZwB64EdQB1AHUAdQB1AHUAdQB1AHUHfQdgAIUHjQd1AHUAlQedB2AAYAClB6sHYACzB7YHvgfGB3UAzgfWBzMB3gfmB1EB7gf1B/0HlQENAQUIDQh1ABUIHQglCBcDLQg1CD0IRQhNCEEDUwh1AHUAdQBbCGMIZAhlCGYIZwhoCGkIYwhkCGUIZghnCGgIaQhjCGQIZQhmCGcIaAhpCGMIZAhlCGYIZwhoCGkIYwhkCGUIZghnCGgIaQhjCGQIZQhmCGcIaAhpCGMIZAhlCGYIZwhoCGkIYwhkCGUIZghnCGgIaQhjCGQIZQhmCGcIaAhpCGMIZAhlCGYIZwhoCGkIYwhkCGUIZghnCGgIaQhjCGQIZQhmCGcIaAhpCGMIZAhlCGYIZwhoCGkIYwhkCGUIZghnCGgIaQhjCGQIZQhmCGcIaAhpCGMIZAhlCGYIZwhoCGkIYwhkCGUIZghnCGgIaQhjCGQIZQhmCGcIaAhpCGMIZAhlCGYIZwhoCGkIYwhkCGUIZghnCGgIaQhjCGQIZQhmCGcIaAhpCGMIZAhlCGYIZwhoCGkIYwhkCGUIZghnCGgIaQhjCGQIZQhmCGcIaAhpCGMIZAhlCGYIZwhoCGkIYwhkCGUIZghnCGgIaQhjCGQIZQhmCGcIaAhpCGMIZAhlCGYIZwhoCGkIYwhkCGUIZghnCGgIaQhjCGQIZQhmCGcIaAhpCGMIZAhlCGYIZwhoCGkIYwhkCGUIZghnCGgIaQhjCGQIZQhmCGcIaAhpCGMIZAhlCGYIZwhoCGkIYwhkCGUIZghnCGgIaQhjCGQIZQhmCGcIaAhpCGMIZAhlCGYIZwhoCGkIYwhkCGUIZghnCGgIaQhjCGQIZQhmCGcIaAhpCGMIZAhlCGYIZwhoCGkIYwhkCGUIZghnCGgIaQhjCGQIZQhmCGcIaAhpCGMIZAhlCGYIZwhoCGkIYwhkCGUIZghnCGgIaQhjCGQIZQhmCGcIaAhpCGMIZAhlCGYIZwhoCGkIYwhkCGUIZghnCGgIaQhjCGQIZQhmCGcIaAhpCGMIZAhlCGYIZwhoCGkIYwhkCGUIZghnCGgIcAh3CHoIMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwAIIIggiCCIIIggiCCIIIggiCCIIIggiCCIIIggiCCIIIggiCCIIIggiCCIIIggiCCIIIggiCCIIIggiCCIIIgggwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAALAcsBywHLAcsBywHLAcsBywHLAcsB4oILAcsB44I0gaWCJ4Ipgh1AHUAqgiyCHUAdQB1AHUAdQB1AHUAdQB1AHUAtwh8AXUAvwh1AMUIyQjRCNkI4AjoCHUAdQB1AO4I9gj+CAYJDgkTCS0HGwkjCYIIggiCCIIIggiCCIIIggiCCIIIggiCCIIIggiCCIIIggiCCIIIggiCCIIIggiCCIIIggiCCIIIggiCCIIIggiAAIAAAAFAAYABgAGIAXwBgAHEAdQBFAJUAogCyAKAAYABgAEIA4ABGANMA4QDxAMEBDwE1AFwBLAE6AQEBUQF4QkhCmEKoQrhCgAHIQsAB0MLAAcABwAHAAeDC6ABoAHDCwMMAAcABwAHAAdDDGMMAAcAB6MM4wwjDWMNow3jDaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAEjDqABWw6bDqABpg6gAaABoAHcDvwOPA+gAaABfA/8DvwO/A78DvwO/A78DvwO/A78DvwO/A78DvwO/A78DvwO/A78DvwO/A78DvwO/A78DvwO/A78DpcPAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcAB9cPKwkyCToJMAB1AHUAdQBCCUoJTQl1AFUJXAljCWcJawkwADAAMAAwAHMJdQB2CX4JdQCECYoJjgmWCXUAngkwAGAAYABxAHUApgn3A64JtAl1ALkJdQDACTAAMAAwADAAdQB1AHUAdQB1AHUAdQB1AHUAowYNBMUIMAAwADAAMADICcsJ0wnZCRUE4QkwAOkJ8An4CTAAMAB1AAAKvwh1AAgKDwoXCh8KdQAwACcKLgp1ADYKqAmICT4KRgowADAAdQB1AE4KMAB1AFYKdQBeCnUAZQowADAAMAAwADAAMAAwADAAMAAVBHUAbQowADAAdQC5CXUKMAAwAHwBxAijBogEMgF9CoQKiASMCpQKmgqIBKIKqgquCogEDQG2Cr4KxgrLCjAAMADTCtsKCgHjCusK8Qr5CgELMAAwADAAMAB1AIsECQsRC3UANAEZCzAAMAAwADAAMAB1ACELKQswAHUANAExCzkLdQBBC0kLMABRC1kLMAAwADAAMAAwADAAdQBhCzAAMAAwAGAAYABpC3ELdwt/CzAAMACHC4sLkwubC58Lpwt1AK4Ltgt1APsDMAAwADAAMAAwADAAMAAwAL4LwwvLC9IL1wvdCzAAMADlC+kL8Qv5C/8LSQswADAAMAAwADAAMAAwADAAMAAHDDAAMAAwADAAMAAODBYMHgx1AHUAdQB1AHUAdQB1AHUAdQB1AHUAdQB1AHUAdQB1AHUAdQB1AHUAdQB1AHUAdQB1AHUAdQB1ACYMMAAwADAAdQB1AHUALgx1AHUAdQB1AHUAdQA2DDAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwAHUAdQB1AHUAdQB1AHUAdQB1AHUAdQB1AHUAdQB1AHUAdQB1AD4MdQBGDHUAdQB1AHUAdQB1AEkMdQB1AHUAdQB1AFAMMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwAHUAdQB1AHUAdQB1AHUAdQB1AHUAdQB1AHUAdQBYDHUAdQB1AF8MMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAB1AHUAdQB1AHUAdQB1AHUAdQB1AHUAdQB1AHUAdQB1AHUA+wMVBGcMMAAwAHwBbwx1AHcMfwyHDI8MMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAYABgAJcMMAAwADAAdQB1AJ8MlQClDDAAMACtDCwHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsB7UMLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHdQB1AHUAdQB1AHUAdQB1AHUAdQB1AHUAdQB1AA0EMAC9DDAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAsBywHLAcsBywHLAcsBywHLQcwAMEMyAwsBywHLAcsBywHLAcsBywHLAcsBywHzAwwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwAHUAdQB1ANQM2QzhDDAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMABgAGAAYABgAGAAYABgAOkMYADxDGAA+AwADQYNYABhCWAAYAAODTAAMAAwADAAFg1gAGAAHg37AzAAMAAwADAAYABgACYNYAAsDTQNPA1gAEMNPg1LDWAAYABgAGAAYABgAGAAYABgAGAAUg1aDYsGVglhDV0NcQBnDW0NdQ15DWAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAlQCBDZUAiA2PDZcNMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAnw2nDTAAMAAwADAAMAAwAHUArw23DTAAMAAwADAAMAAwADAAMAAwADAAMAB1AL8NMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAB1AHUAdQB1AHUAdQDHDTAAYABgAM8NMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAA1w11ANwNMAAwAD0B5A0wADAAMAAwADAAMADsDfQN/A0EDgwOFA4wABsOMAAwADAAMAAwADAAMAAwANIG0gbSBtIG0gbSBtIG0gYjDigOwQUuDsEFMw7SBjoO0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIGQg5KDlIOVg7SBtIGXg5lDm0OdQ7SBtIGfQ6EDooOjQ6UDtIGmg6hDtIG0gaoDqwO0ga0DrwO0gZgAGAAYADEDmAAYAAkBtIGzA5gANIOYADaDokO0gbSBt8O5w7SBu8O0gb1DvwO0gZgAGAAxA7SBtIG0gbSBtIGYABgAGAAYAAED2AAsAUMD9IG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIGFA8sBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAccD9IGLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHJA8sBywHLAcsBywHLAccDywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywPLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAc0D9IG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIGLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAccD9IG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIGFA8sBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHLAcsBywHPA/SBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gbSBtIG0gYUD0QPlQCVAJUAMAAwADAAMACVAJUAlQCVAJUAlQCVAEwPMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAA//8EAAQABAAEAAQABAAEAAQABAANAAMAAQABAAIABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQACgATABcAHgAbABoAHgAXABYAEgAeABsAGAAPABgAHABLAEsASwBLAEsASwBLAEsASwBLABgAGAAeAB4AHgATAB4AUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQABYAGwASAB4AHgAeAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAWAA0AEQAeAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArAAQABAAEAAQABAAFAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAJABYAGgAbABsAGwAeAB0AHQAeAE8AFwAeAA0AHgAeABoAGwBPAE8ADgBQAB0AHQAdAE8ATwAXAE8ATwBPABYAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAB0AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAdAFAAUABQAFAAUABQAFAAUAAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAFAAHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAeAB4AHgAeAFAATwBAAE8ATwBPAEAATwBQAFAATwBQAB4AHgAeAB4AHgAeAB0AHQAdAB0AHgAdAB4ADgBQAFAAUABQAFAAHgAeAB4AHgAeAB4AHgBQAB4AUAAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4ABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAJAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAkACQAJAAkACQAJAAkABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAeAB4AHgAeAFAAHgAeAB4AKwArAFAAUABQAFAAGABQACsAKwArACsAHgAeAFAAHgBQAFAAUAArAFAAKwAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AKwAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4ABAAEAAQABAAEAAQABAAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgArAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAArACsAUAAeAB4AHgAeAB4AHgBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAYAA0AKwArAB4AHgAbACsABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQADQAEAB4ABAAEAB4ABAAEABMABAArACsAKwArACsAKwArACsAVgBWAFYAVgBWAFYAVgBWAFYAVgBWAFYAVgBWAFYAVgBWAFYAVgBWAFYAVgBWAFYAVgBWAFYAKwArACsAKwBWAFYAVgBWAB4AHgArACsAKwArACsAKwArACsAKwArACsAHgAeAB4AHgAeAB4AHgAeAB4AGgAaABoAGAAYAB4AHgAEAAQABAAEAAQABAAEAAQABAAEAAQAEwAEACsAEwATAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABABLAEsASwBLAEsASwBLAEsASwBLABoAGQAZAB4AUABQAAQAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQABMAUAAEAAQABAAEAAQABAAEAB4AHgAEAAQABAAEAAQABABQAFAABAAEAB4ABAAEAAQABABQAFAASwBLAEsASwBLAEsASwBLAEsASwBQAFAAUAAeAB4AUAAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AKwAeAFAABABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEACsAKwBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAABAAEAAQABAAEAAQABAAEAAQABAAEAFAAKwArACsAKwArACsAKwArACsAKwArACsAKwArAEsASwBLAEsASwBLAEsASwBLAEsAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAABAAEAAQABAAEAAQABAAEAAQAUABQAB4AHgAYABMAUAArACsABAAbABsAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAEAAQABAAEAFAABAAEAAQABAAEAFAABAAEAAQAUAAEAAQABAAEAAQAKwArAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeACsAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAEAAQABAArACsAHgArAFAAUABQAFAAUABQAFAAUABQAFAAUAArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAArAFAAUABQAFAAUABQAFAAUABQAFAAKwArACsAKwArACsAKwArACsAKwArAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAB4ABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAQABAAEAFAABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQAUAAEAAQABAAEAAQABAAEAFAAUABQAFAAUABQAFAAUABQAFAABAAEAA0ADQBLAEsASwBLAEsASwBLAEsASwBLAB4AUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAEAAQABAArAFAAUABQAFAAUABQAFAAUAArACsAUABQACsAKwBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAKwBQAFAAUABQAFAAUABQACsAUAArACsAKwBQAFAAUABQACsAKwAEAFAABAAEAAQABAAEAAQABAArACsABAAEACsAKwAEAAQABABQACsAKwArACsAKwArACsAKwAEACsAKwArACsAUABQACsAUABQAFAABAAEACsAKwBLAEsASwBLAEsASwBLAEsASwBLAFAAUAAaABoAUABQAFAAUABQAEwAHgAbAFAAHgAEACsAKwAEAAQABAArAFAAUABQAFAAUABQACsAKwArACsAUABQACsAKwBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAKwBQAFAAUABQAFAAUABQACsAUABQACsAUABQACsAUABQACsAKwAEACsABAAEAAQABAAEACsAKwArACsABAAEACsAKwAEAAQABAArACsAKwAEACsAKwArACsAKwArACsAUABQAFAAUAArAFAAKwArACsAKwArACsAKwBLAEsASwBLAEsASwBLAEsASwBLAAQABABQAFAAUAAEAB4AKwArACsAKwArACsAKwArACsAKwAEAAQABAArAFAAUABQAFAAUABQAFAAUABQACsAUABQAFAAKwBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAKwBQAFAAUABQAFAAUABQACsAUABQACsAUABQAFAAUABQACsAKwAEAFAABAAEAAQABAAEAAQABAAEACsABAAEAAQAKwAEAAQABAArACsAUAArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwBQAFAABAAEACsAKwBLAEsASwBLAEsASwBLAEsASwBLAB4AGwArACsAKwArACsAKwArAFAABAAEAAQABAAEAAQAKwAEAAQABAArAFAAUABQAFAAUABQAFAAUAArACsAUABQACsAKwBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAQABAAEAAQABAArACsABAAEACsAKwAEAAQABAArACsAKwArACsAKwArAAQABAAEACsAKwArACsAUABQACsAUABQAFAABAAEACsAKwBLAEsASwBLAEsASwBLAEsASwBLAB4AUABQAFAAUABQAFAAUAArACsAKwArACsAKwArACsAKwArAAQAUAArAFAAUABQAFAAUABQACsAKwArAFAAUABQACsAUABQAFAAUAArACsAKwBQAFAAKwBQACsAUABQACsAKwArAFAAUAArACsAKwBQAFAAUAArACsAKwBQAFAAUABQAFAAUABQAFAAUABQAFAAUAArACsAKwArAAQABAAEAAQABAArACsAKwAEAAQABAArAAQABAAEAAQAKwArAFAAKwArACsAKwArACsABAArACsAKwArACsAKwArACsAKwArAEsASwBLAEsASwBLAEsASwBLAEsAUABQAFAAHgAeAB4AHgAeAB4AGwAeACsAKwArACsAKwAEAAQABAAEAAQAUABQAFAAUABQAFAAUABQACsAUABQAFAAKwBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAArAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAKwArACsAUAAEAAQABAAEAAQABAAEACsABAAEAAQAKwAEAAQABAAEACsAKwArACsAKwArACsABAAEACsAUABQAFAAKwArACsAKwArAFAAUAAEAAQAKwArAEsASwBLAEsASwBLAEsASwBLAEsAKwArACsAKwArACsAKwAOAFAAUABQAFAAUABQAFAAHgBQAAQABAAEAA4AUABQAFAAUABQAFAAUABQACsAUABQAFAAKwBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAArAFAAUABQAFAAUABQAFAAUABQAFAAKwBQAFAAUABQAFAAKwArAAQAUAAEAAQABAAEAAQABAAEACsABAAEAAQAKwAEAAQABAAEACsAKwArACsAKwArACsABAAEACsAKwArACsAKwArACsAUAArAFAAUAAEAAQAKwArAEsASwBLAEsASwBLAEsASwBLAEsAKwBQAFAAKwArACsAKwArACsAKwArACsAKwArACsAKwAEAAQABAAEAFAAUABQAFAAUABQAFAAUABQACsAUABQAFAAKwBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAABAAEAFAABAAEAAQABAAEAAQABAArAAQABAAEACsABAAEAAQABABQAB4AKwArACsAKwBQAFAAUAAEAFAAUABQAFAAUABQAFAAUABQAFAABAAEACsAKwBLAEsASwBLAEsASwBLAEsASwBLAFAAUABQAFAAUABQAFAAUABQABoAUABQAFAAUABQAFAAKwAEAAQABAArAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQACsAKwArAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAArAFAAUABQAFAAUABQAFAAUABQACsAUAArACsAUABQAFAAUABQAFAAUAArACsAKwAEACsAKwArACsABAAEAAQABAAEAAQAKwAEACsABAAEAAQABAAEAAQABAAEACsAKwArACsAKwArAEsASwBLAEsASwBLAEsASwBLAEsAKwArAAQABAAeACsAKwArACsAKwArACsAKwArACsAKwArAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXAAqAFwAXAAqACoAKgAqACoAKgAqACsAKwArACsAGwBcAFwAXABcAFwAXABcACoAKgAqACoAKgAqACoAKgAeAEsASwBLAEsASwBLAEsASwBLAEsADQANACsAKwArACsAKwBcAFwAKwBcACsAXABcAFwAXABcACsAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcACsAXAArAFwAXABcAFwAXABcAFwAXABcAFwAKgBcAFwAKgAqACoAKgAqACoAKgAqACoAXAArACsAXABcAFwAXABcACsAXAArACoAKgAqACoAKgAqACsAKwBLAEsASwBLAEsASwBLAEsASwBLACsAKwBcAFwAXABcAFAADgAOAA4ADgAeAA4ADgAJAA4ADgANAAkAEwATABMAEwATAAkAHgATAB4AHgAeAAQABAAeAB4AHgAeAB4AHgBLAEsASwBLAEsASwBLAEsASwBLAFAAUABQAFAAUABQAFAAUABQAFAADQAEAB4ABAAeAAQAFgARABYAEQAEAAQAUABQAFAAUABQAFAAUABQACsAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAKwArACsAKwAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQADQAEAAQABAAEAAQADQAEAAQAUABQAFAAUABQAAQABAAEAAQABAAEAAQABAAEAAQABAArAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAArAA0ADQAeAB4AHgAeAB4AHgAEAB4AHgAeAB4AHgAeACsAHgAeAA4ADgANAA4AHgAeAB4AHgAeAAkACQArACsAKwArACsAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcACoAKgAqACoAKgAqACoAKgAqACoAKgAqACoAKgAqACoAKgAqACoAKgBcAEsASwBLAEsASwBLAEsASwBLAEsADQANAB4AHgAeAB4AXABcAFwAXABcAFwAKgAqACoAKgBcAFwAXABcACoAKgAqAFwAKgAqACoAXABcACoAKgAqACoAKgAqACoAXABcAFwAKgAqACoAKgBcAFwAXABcAFwAXABcAFwAXABcAFwAXABcACoAKgAqACoAKgAqACoAKgAqACoAKgAqAFwAKgBLAEsASwBLAEsASwBLAEsASwBLACoAKgAqACoAKgAqAFAAUABQAFAAUABQACsAUAArACsAKwArACsAUAArACsAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAHgBQAFAAUABQAFgAWABYAFgAWABYAFgAWABYAFgAWABYAFgAWABYAFgAWABYAFgAWABYAFgAWABYAFgAWABYAFgAWABYAFgAWABZAFkAWQBZAFkAWQBZAFkAWQBZAFkAWQBZAFkAWQBZAFkAWQBZAFkAWQBZAFkAWQBZAFkAWQBZAFkAWQBZAFkAWgBaAFoAWgBaAFoAWgBaAFoAWgBaAFoAWgBaAFoAWgBaAFoAWgBaAFoAWgBaAFoAWgBaAFoAWgBaAFoAWgBaAFAAUABQAFAAUABQAFAAUABQACsAUABQAFAAUAArACsAUABQAFAAUABQAFAAUAArAFAAKwBQAFAAUABQACsAKwBQAFAAUABQAFAAUABQAFAAUAArAFAAUABQAFAAKwArAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAArAFAAUABQAFAAKwArAFAAUABQAFAAUABQAFAAKwBQACsAUABQAFAAUAArACsAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAKwBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAKwBQAFAAUABQACsAKwBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAArACsABAAEAAQAHgANAB4AHgAeAB4AHgAeAB4AUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQACsAKwArAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAHgAeAB4AHgAeAB4AHgAeAB4AHgArACsAKwArACsAKwBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQACsAKwBQAFAAUABQAFAAUAArACsADQBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAHgAeAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAANAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAWABEAKwArACsAUABQAFAAUABQAFAAUABQAFAAUABQAA0ADQANAFAAUABQAFAAUABQAFAAUABQAFAAUAArACsAKwArACsAKwArAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAKwBQAFAAUABQAAQABAAEACsAKwArACsAKwArACsAKwArACsAKwBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAEAAQABAANAA0AKwArACsAKwArACsAKwArACsAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAABAAEACsAKwArACsAKwArACsAKwArACsAKwArAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAKwBQAFAAUAArAAQABAArACsAKwArACsAKwArACsAKwArACsAKwBcAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAKgAqACoAKgAqACoAKgAqACoAKgAqACoAKgAqACoAKgAqACoAKgAqAA0ADQAVAFwADQAeAA0AGwBcACoAKwArAEsASwBLAEsASwBLAEsASwBLAEsAKwArACsAKwArACsAUABQAFAAUABQAFAAUABQAFAAUAArACsAKwArACsAKwAeAB4AEwATAA0ADQAOAB4AEwATAB4ABAAEAAQACQArAEsASwBLAEsASwBLAEsASwBLAEsAKwArACsAKwArACsAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAArACsAKwArACsAKwArAFAAUABQAFAAUAAEAAQAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAQAUAArACsAKwArACsAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAArACsAKwArACsAKwArACsAKwArAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAKwAEAAQABAAEAAQABAAEAAQABAAEAAQABAArACsAKwArAAQABAAEAAQABAAEAAQABAAEAAQABAAEACsAKwArACsAHgArACsAKwATABMASwBLAEsASwBLAEsASwBLAEsASwBcAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXAArACsAXABcAFwAXABcACsAKwArACsAKwArACsAKwArACsAKwBcAFwAXABcAFwAXABcAFwAXABcAFwAXAArACsAKwArAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcACsAKwArACsAKwArAEsASwBLAEsASwBLAEsASwBLAEsAXAArACsAKwAqACoAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAQABAAEAAQABAArACsAHgAeAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcACoAKgAqACoAKgAqACoAKgAqACoAKwAqACoAKgAqACoAKgAqACoAKgAqACoAKgAqACoAKgAqACoAKgAqACoAKgAqACoAKgAqACoAKgAqACoAKwArAAQASwBLAEsASwBLAEsASwBLAEsASwArACsAKwArACsAKwBLAEsASwBLAEsASwBLAEsASwBLACsAKwArACsAKwArACoAKgAqACoAKgAqACoAXAAqACoAKgAqACoAKgArACsABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsABAAEAAQABAAEAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAQABAAEAAQABABQAFAAUABQAFAAUABQACsAKwArACsASwBLAEsASwBLAEsASwBLAEsASwANAA0AHgANAA0ADQANAB4AHgAeAB4AHgAeAB4AHgAeAB4ABAAEAAQABAAEAAQABAAEAAQAHgAeAB4AHgAeAB4AHgAeAB4AKwArACsABAAEAAQAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAABAAEAAQABAAEAAQABAAEAAQABAAEAAQABABQAFAASwBLAEsASwBLAEsASwBLAEsASwBQAFAAUABQAFAAUABQAFAABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEACsAKwArACsAKwArACsAKwAeAB4AHgAeAFAAUABQAFAABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEACsAKwArAA0ADQANAA0ADQBLAEsASwBLAEsASwBLAEsASwBLACsAKwArAFAAUABQAEsASwBLAEsASwBLAEsASwBLAEsAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAA0ADQBQAFAAUABQAFAAUABQAFAAUAArACsAKwArACsAKwArAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQACsAKwBQAFAAUAAeAB4AHgAeAB4AHgAeAB4AKwArACsAKwArACsAKwArAAQABAAEAB4ABAAEAAQABAAEAAQABAAEAAQABAAEAAQABABQAFAAUABQAAQAUABQAFAAUABQAFAABABQAFAABAAEAAQAUAArACsAKwArACsABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEACsABAAEAAQABAAEAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AKwArAFAAUABQAFAAUABQACsAKwBQAFAAUABQAFAAUABQAFAAKwBQACsAUAArAFAAKwAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeACsAKwAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgArAB4AHgAeAB4AHgAeAB4AHgBQAB4AHgAeAFAAUABQACsAHgAeAB4AHgAeAB4AHgAeAB4AHgBQAFAAUABQACsAKwAeAB4AHgAeAB4AHgArAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AKwArAFAAUABQACsAHgAeAB4AHgAeAB4AHgAOAB4AKwANAA0ADQANAA0ADQANAAkADQANAA0ACAAEAAsABAAEAA0ACQANAA0ADAAdAB0AHgAXABcAFgAXABcAFwAWABcAHQAdAB4AHgAUABQAFAANAAEAAQAEAAQABAAEAAQACQAaABoAGgAaABoAGgAaABoAHgAXABcAHQAVABUAHgAeAB4AHgAeAB4AGAAWABEAFQAVABUAHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4ADQAeAA0ADQANAA0AHgANAA0ADQAHAB4AHgAeAB4AKwAEAAQABAAEAAQABAAEAAQABAAEAFAAUAArACsATwBQAFAAUABQAFAAHgAeAB4AFgARAE8AUABPAE8ATwBPAFAAUABQAFAAUAAeAB4AHgAWABEAKwBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQACsAKwArABsAGwAbABsAGwAbABsAGgAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGgAbABsAGwAbABoAGwAbABoAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQAHgAeAFAAGgAeAB0AHgBQAB4AGgAeAB4AHgAeAB4AHgAeAB4AHgBPAB4AUAAbAB4AHgBQAFAAUABQAFAAHgAeAB4AHQAdAB4AUAAeAFAAHgBQAB4AUABPAFAAUAAeAB4AHgAeAB4AHgAeAFAAUABQAFAAUAAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAFAAHgBQAFAAUABQAE8ATwBQAFAAUABQAFAATwBQAFAATwBQAE8ATwBPAE8ATwBPAE8ATwBPAE8ATwBPAFAAUABQAFAATwBPAE8ATwBPAE8ATwBPAE8ATwBQAFAAUABQAFAAUABQAFAAUAAeAB4AUABQAFAAUABPAB4AHgArACsAKwArAB0AHQAdAB0AHQAdAB0AHQAdAB0AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB0AHgAdAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAdAB4AHQAdAB4AHgAeAB0AHQAeAB4AHQAeAB4AHgAdAB4AHQAbABsAHgAdAB4AHgAeAB4AHQAeAB4AHQAdAB0AHQAeAB4AHQAeAB0AHgAdAB0AHQAdAB0AHQAeAB0AHgAeAB4AHgAeAB0AHQAdAB0AHgAeAB4AHgAdAB0AHgAeAB4AHgAeAB4AHgAeAB4AHgAdAB4AHgAeAB0AHgAeAB4AHgAeAB0AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAdAB0AHgAeAB0AHQAdAB0AHgAeAB0AHQAeAB4AHQAdAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB0AHQAeAB4AHQAdAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHQAeAB4AHgAdAB4AHgAeAB4AHgAeAB4AHQAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB0AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AFAAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeABYAEQAWABEAHgAeAB4AHgAeAB4AHQAeAB4AHgAeAB4AHgAeACUAJQAeAB4AHgAeAB4AHgAeAB4AHgAWABEAHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AJQAlACUAJQAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArAE8ATwBPAE8ATwBPAE8ATwBPAE8ATwBPAE8ATwBPAE8ATwBPAE8ATwBPAE8ATwBPAE8ATwBPAE8ATwBPAE8ATwAdAB0AHQAdAB0AHQAdAB0AHQAdAB0AHQAdAB0AHQAdAB0AHQAdAB0AHQAdAB0AHQAdAB0AHQAdAB0AHQAdAB0AHQAdAE8ATwBPAE8ATwBPAE8ATwBPAE8ATwBPAE8ATwBPAE8ATwBPAE8ATwBPAFAAHQAdAB0AHQAdAB0AHQAdAB0AHQAdAB0AHgAeAB4AHgAdAB0AHQAdAB0AHQAdAB0AHQAdAB0AHQAdAB0AHQAdAB0AHQAdAB0AHQAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHQAdAB0AHQAdAB0AHQAdAB0AHQAdAB0AHQAdAB0AHQAeAB4AHQAdAB0AHQAeAB4AHgAeAB4AHgAeAB4AHgAeAB0AHQAeAB0AHQAdAB0AHQAdAB0AHgAeAB4AHgAeAB4AHgAeAB0AHQAeAB4AHQAdAB4AHgAeAB4AHQAdAB4AHgAeAB4AHQAdAB0AHgAeAB0AHgAeAB0AHQAdAB0AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAdAB0AHQAdAB4AHgAeAB4AHgAeAB4AHgAeAB0AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAlACUAJQAlAB4AHQAdAB4AHgAdAB4AHgAeAB4AHQAdAB4AHgAeAB4AJQAlAB0AHQAlAB4AJQAlACUAIAAlACUAHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAlACUAJQAeAB4AHgAeAB0AHgAdAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAdAB0AHgAdAB0AHQAeAB0AJQAdAB0AHgAdAB0AHgAdAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeACUAHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHQAdAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAlACUAJQAlACUAJQAlACUAJQAlACUAJQAdAB0AHQAdACUAHgAlACUAJQAdACUAJQAdAB0AHQAlACUAHQAdACUAHQAdACUAJQAlAB4AHQAeAB4AHgAeAB0AHQAlAB0AHQAdAB0AHQAdACUAJQAlACUAJQAdACUAJQAgACUAHQAdACUAJQAlACUAJQAlACUAJQAeAB4AHgAlACUAIAAgACAAIAAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB0AHgAeAB4AFwAXABcAFwAXABcAHgATABMAJQAeAB4AHgAWABEAFgARABYAEQAWABEAFgARABYAEQAWABEATwBPAE8ATwBPAE8ATwBPAE8ATwBPAE8ATwBPAE8ATwBPAE8ATwBPAE8ATwAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeABYAEQAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAWABEAFgARABYAEQAWABEAFgARAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AFgARABYAEQAWABEAFgARABYAEQAWABEAFgARABYAEQAWABEAFgARABYAEQAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAWABEAFgARAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AFgARAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAdAB0AHQAdAB0AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgArACsAHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AKwAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AUABQAFAAUAAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAEAAQABAAeAB4AKwArACsAKwArABMADQANAA0AUAATAA0AUABQAFAAUABQAFAAUABQACsAKwArACsAKwArACsAUAANACsAKwArACsAKwArACsAKwArACsAKwArACsAKwAEAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAArACsAKwArACsAKwArACsAKwBQAFAAUABQAFAAUABQACsAUABQAFAAUABQAFAAUAArAFAAUABQAFAAUABQAFAAKwBQAFAAUABQAFAAUABQACsAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXAA0ADQANAA0ADQANAA0ADQAeAA0AFgANAB4AHgAXABcAHgAeABcAFwAWABEAFgARABYAEQAWABEADQANAA0ADQATAFAADQANAB4ADQANAB4AHgAeAB4AHgAMAAwADQANAA0AHgANAA0AFgANAA0ADQANAA0ADQANAA0AHgANAB4ADQANAB4AHgAeACsAKwArACsAKwArACsAKwArACsAKwArACsAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACsAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAKwArACsAKwArACsAKwArACsAKwArACsAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwAlACUAJQAlACUAJQAlACUAJQAlACUAJQArACsAKwArAA0AEQARACUAJQBHAFcAVwAWABEAFgARABYAEQAWABEAFgARACUAJQAWABEAFgARABYAEQAWABEAFQAWABEAEQAlAFcAVwBXAFcAVwBXAFcAVwBXAAQABAAEAAQABAAEACUAVwBXAFcAVwA2ACUAJQBXAFcAVwBHAEcAJQAlACUAKwBRAFcAUQBXAFEAVwBRAFcAUQBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFEAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBRAFcAUQBXAFEAVwBXAFcAVwBXAFcAUQBXAFcAVwBXAFcAVwBRAFEAKwArAAQABAAVABUARwBHAFcAFQBRAFcAUQBXAFEAVwBRAFcAUQBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFEAVwBRAFcAUQBXAFcAVwBXAFcAVwBRAFcAVwBXAFcAVwBXAFEAUQBXAFcAVwBXABUAUQBHAEcAVwArACsAKwArACsAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAKwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAKwAlACUAVwBXAFcAVwAlACUAJQAlACUAJQAlACUAJQAlACsAKwArACsAKwArACsAKwArACsAKwArAFEAUQBRAFEAUQBRAFEAUQBRAFEAUQBRAFEAUQBRAFEAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQArAFcAVwBXAFcAVwBXAFcAVwBXAFcAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQBPAE8ATwBPAE8ATwBPAE8AJQBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXACUAJQAlAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAEcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAKwArACsAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQArACsAKwArACsAKwArACsAKwBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAADQATAA0AUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABLAEsASwBLAEsASwBLAEsASwBLAFAAUAArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAFAABAAEAAQABAAeAAQABAAEAAQABAAEAAQABAAEAAQAHgBQAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AUABQAAQABABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAQABAAeAA0ADQANAA0ADQArACsAKwArACsAKwArACsAHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAFAAUABQAFAAUABQAFAAUABQAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AUAAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgBQAB4AHgAeAB4AHgAeAFAAHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgArACsAHgAeAB4AHgAeAB4AHgAeAB4AKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwAeAB4AUABQAFAAUABQAFAAUABQAFAAUABQAAQAUABQAFAABABQAFAAUABQAAQAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAQABAAEAAQABAAeAB4AHgAeAAQAKwArACsAUABQAFAAUABQAFAAHgAeABoAHgArACsAKwArACsAKwBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAADgAOABMAEwArACsAKwArACsAKwArACsABAAEAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAQABAAEAAQABAAEACsAKwArACsAKwArACsAKwANAA0ASwBLAEsASwBLAEsASwBLAEsASwArACsAKwArACsAKwAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABABQAFAAUABQAFAAUAAeAB4AHgBQAA4AUABQAAQAUABQAFAAUABQAFAABAAEAAQABAAEAAQABAAEAA0ADQBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQAKwArACsAKwArACsAKwArACsAKwArAB4AWABYAFgAWABYAFgAWABYAFgAWABYAFgAWABYAFgAWABYAFgAWABYAFgAWABYAFgAWABYAFgAWABYACsAKwArAAQAHgAeAB4AHgAeAB4ADQANAA0AHgAeAB4AHgArAFAASwBLAEsASwBLAEsASwBLAEsASwArACsAKwArAB4AHgBcAFwAXABcAFwAKgBcAFwAXABcAFwAXABcAFwAXABcAEsASwBLAEsASwBLAEsASwBLAEsAXABcAFwAXABcACsAUABQAFAAUABQAFAAUABQAFAABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEACsAKwArACsAKwArACsAKwArAFAAUABQAAQAUABQAFAAUABQAFAAUABQAAQABAArACsASwBLAEsASwBLAEsASwBLAEsASwArACsAHgANAA0ADQBcAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAKgAqACoAXAAqACoAKgBcAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXAAqAFwAKgAqACoAXABcACoAKgBcAFwAXABcAFwAKgAqAFwAKgBcACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArAFwAXABcACoAKgBQAFAAUABQAFAAUABQAFAAUABQAFAABAAEAAQABAAEAA0ADQBQAFAAUAAEAAQAKwArACsAKwArACsAKwArACsAKwBQAFAAUABQAFAAUAArACsAUABQAFAAUABQAFAAKwArAFAAUABQAFAAUABQACsAKwArACsAKwArACsAKwArAFAAUABQAFAAUABQAFAAKwBQAFAAUABQAFAAUABQACsAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAHgAeACsAKwArACsAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAEAAQABAAEAAQABAAEAAQADQAEAAQAKwArAEsASwBLAEsASwBLAEsASwBLAEsAKwArACsAKwArACsAVABVAFUAVQBVAFUAVQBVAFUAVQBVAFUAVQBVAFUAVQBVAFUAVQBVAFUAVQBVAFUAVQBVAFUAVQBUAFUAVQBVAFUAVQBVAFUAVQBVAFUAVQBVAFUAVQBVAFUAVQBVAFUAVQBVAFUAVQBVAFUAVQBVACsAKwArACsAKwArACsAKwArACsAKwArAFkAWQBZAFkAWQBZAFkAWQBZAFkAWQBZAFkAWQBZAFkAWQBZAFkAKwArACsAKwBaAFoAWgBaAFoAWgBaAFoAWgBaAFoAWgBaAFoAWgBaAFoAWgBaAFoAWgBaAFoAWgBaAFoAWgBaAFoAKwArACsAKwAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXACUAJQBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAJQAlACUAJQAlACUAUABQAFAAUABQAFAAUAArACsAKwArACsAKwArACsAKwArACsAKwBQAFAAUABQAFAAKwArACsAKwArAFYABABWAFYAVgBWAFYAVgBWAFYAVgBWAB4AVgBWAFYAVgBWAFYAVgBWAFYAVgBWAFYAVgArAFYAVgBWAFYAVgArAFYAKwBWAFYAKwBWAFYAKwBWAFYAVgBWAFYAVgBWAFYAVgBWAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAEQAWAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAKwArAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwBQAFAAUABQAFAAUABQAFAAUABQAFAAUAAaAB4AKwArAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQAGAARABEAGAAYABMAEwAWABEAFAArACsAKwArACsAKwAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEACUAJQAlACUAJQAWABEAFgARABYAEQAWABEAFgARABYAEQAlACUAFgARACUAJQAlACUAJQAlACUAEQAlABEAKwAVABUAEwATACUAFgARABYAEQAWABEAJQAlACUAJQAlACUAJQAlACsAJQAbABoAJQArACsAKwArAFAAUABQAFAAUAArAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAKwArAAcAKwATACUAJQAbABoAJQAlABYAEQAlACUAEQAlABEAJQBXAFcAVwBXAFcAVwBXAFcAVwBXABUAFQAlACUAJQATACUAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXABYAJQARACUAJQAlAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwAWACUAEQAlABYAEQARABYAEQARABUAVwBRAFEAUQBRAFEAUQBRAFEAUQBRAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAEcARwArACsAVwBXAFcAVwBXAFcAKwArAFcAVwBXAFcAVwBXACsAKwBXAFcAVwBXAFcAVwArACsAVwBXAFcAKwArACsAGgAbACUAJQAlABsAGwArAB4AHgAeAB4AHgAeAB4AKwArACsAKwArACsAKwArACsAKwAEAAQABAAQAB0AKwArAFAAUABQAFAAUABQAFAAUABQAFAAUABQACsAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAArAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAKwBQAFAAKwBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAArACsAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQACsAKwBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAArACsAKwArACsADQANAA0AKwArACsAKwBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQACsAKwArAB4AHgAeAB4AHgAeAB4AHgAeAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgBQAFAAHgAeAB4AKwAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAAQAKwArAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwAEAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQACsAKwArACsAKwArACsAKwArAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAKwArACsAKwArAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAABAAEAAQABAAEACsAKwArACsAKwBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAArAA0AUABQAFAAUAArACsAKwArAFAAUABQAFAAUABQAFAAUAANAFAAUABQAFAAUAArACsAKwArACsAKwArACsAKwArAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQACsAKwBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAKwArACsAKwBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQACsAKwArACsAKwArACsAKwBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQACsAKwArACsAKwArACsAKwArACsAKwAeACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAUABQAFAAUABQAFAAKwArAFAAKwBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAArAFAAUAArACsAKwBQACsAKwBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAKwANAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAeAB4AUABQAFAAUABQAFAAUAArACsAKwArACsAKwArAFAAUABQAFAAUABQAFAAUABQACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAArAFAAUAArACsAKwArACsAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQACsAKwArAA0AUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQACsAKwArACsAKwAeAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQACsAKwArACsAUABQAFAAUABQAAQABAAEACsABAAEACsAKwArACsAKwAEAAQABAAEAFAAUABQAFAAKwBQAFAAUAArAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAKwArAAQABAAEACsAKwArACsABABQAFAAUABQAFAAUABQAFAAUAArACsAKwArACsAKwArAA0ADQANAA0ADQANAA0ADQAeACsAKwArACsAKwArACsAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAeAFAAUABQAFAAUABQAFAAUAAeAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAQABAArACsAKwArAFAAUABQAFAAUAANAA0ADQANAA0ADQAUACsAKwArACsAKwArACsAKwArAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAKwArACsADQANAA0ADQANAA0ADQBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAArACsAKwArACsAKwArAB4AHgAeAB4AKwArACsAKwArACsAKwArACsAKwArACsAUABQAFAAUABQAFAAUAArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArAFAAUABQAFAAUABQAFAAUABQACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQACsAKwArACsAKwArACsAKwArACsAKwArACsAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAArACsAKwArACsAKwArAFAAUABQAFAAUABQAAQABAAEAAQAKwArACsAKwArACsAKwArAEsASwBLAEsASwBLAEsASwBLAEsAKwArACsAKwArACsAUABQAFAAUABQAFAAUABQAFAAUAArAAQABAANACsAKwBQAFAAKwArACsAKwArACsAKwArACsAKwArACsAKwArAFAAUABQAFAAUABQAAQABAAEAAQABAAEAAQABAAEAAQABABQAFAAUABQAB4AHgAeAB4AHgArACsAKwArACsAKwAEAAQABAAEAAQABAAEAA0ADQAeAB4AHgAeAB4AKwArACsAKwBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAEsASwBLAEsASwBLAEsASwBLAEsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsABABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAQABAAEAAQABAAEAAQABAAEAAQABAAeAB4AHgANAA0ADQANACsAKwArACsAKwArACsAKwArACsAKwAeACsAKwBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAKwArACsAKwArACsAKwBLAEsASwBLAEsASwBLAEsASwBLACsAKwArACsAKwArAFAAUABQAFAAUABQAFAABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEACsASwBLAEsASwBLAEsASwBLAEsASwANAA0ADQANAFAABAAEAFAAKwArACsAKwArACsAKwArAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAABAAeAA4AUAArACsAKwArACsAKwArACsAKwAEAFAAUABQAFAADQANAB4ADQAEAAQABAAEAB4ABAAEAEsASwBLAEsASwBLAEsASwBLAEsAUAAOAFAADQANAA0AKwBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAKwArACsAKwArACsAKwArACsAKwArAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQACsAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAEAAQABAAEAAQABAAEAAQABAAEAAQABAANAA0AHgANAA0AHgAEACsAUABQAFAAUABQAFAAUAArAFAAKwBQAFAAUABQACsAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAKwBQAFAAUABQAFAAUABQAFAAUABQAA0AKwArACsAKwArACsAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAEAAQABAAEAAQABAAEAAQABAAEAAQAKwArACsAKwArAEsASwBLAEsASwBLAEsASwBLAEsAKwArACsAKwArACsABAAEAAQABAArAFAAUABQAFAAUABQAFAAUAArACsAUABQACsAKwBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAKwBQAFAAUABQAFAAUABQACsAUABQACsAUABQAFAAUABQACsABAAEAFAABAAEAAQABAAEAAQABAArACsABAAEACsAKwAEAAQABAArACsAUAArACsAKwArACsAKwAEACsAKwArACsAKwBQAFAAUABQAFAABAAEACsAKwAEAAQABAAEAAQABAAEACsAKwArAAQABAAEAAQABAArACsAKwArACsAKwArACsAKwArACsABAAEAAQABAAEAAQABABQAFAAUABQAA0ADQANAA0AHgBLAEsASwBLAEsASwBLAEsASwBLAA0ADQArAB4ABABQAFAAUAArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwAEAAQABAAEAFAAUAAeAFAAKwArACsAKwArACsAKwArAEsASwBLAEsASwBLAEsASwBLAEsAKwArACsAKwArACsAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAABAAEAAQABAAEAAQABAArACsABAAEAAQABAAEAAQABAAEAAQADgANAA0AEwATAB4AHgAeAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAFAAUABQAFAABAAEACsAKwAEAA0ADQAeAFAAKwArACsAKwArACsAKwArACsAKwArAEsASwBLAEsASwBLAEsASwBLAEsAKwArACsAKwArACsADgAOAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArAFAAUABQAFAAUABQAFAAUABQAFAAUAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAFAAKwArACsAKwArACsAKwBLAEsASwBLAEsASwBLAEsASwBLACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAKwArACoAKgAqACoAKgAqACoAKgAqACoAKgAqACoAKgAqACsAKwArACsASwBLAEsASwBLAEsASwBLAEsASwBcAFwADQANAA0AKgBQAFAAUABQAFAAUABQAFAAUABQAFAAUAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAeACsAKwArACsASwBLAEsASwBLAEsASwBLAEsASwBQAFAAUABQAFAAUABQAFAAUAArACsAKwArACsAKwArACsAKwArACsAKwBQAFAAUABQAFAAUABQAFAAKwArAFAAKwArAFAAUABQAFAAUABQAFAAUAArAFAAUAArAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAABAAEAAQABAAEAAQAKwAEAAQAKwArAAQABAAEAAQAUAAEAFAABAAEAA0ADQANACsAKwArACsAKwArACsAKwArAEsASwBLAEsASwBLAEsASwBLAEsAKwArACsAKwArACsAUABQAFAAUABQAFAAUABQACsAKwBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAABAAEAAQABAAEAAQABAArACsABAAEAAQABAAEAAQABABQAA4AUAAEACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArAFAABAAEAAQABAAEAAQABAAEAAQABABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAEAAQABAAEAAQABAAEAFAABAAEAAQABAAOAB4ADQANAA0ADQAOAB4ABAArACsAKwArACsAKwArACsAUAAEAAQABAAEAAQABAAEAAQABAAEAAQAUABQAFAAUABQAFAAUABQAFAAUAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAA0ADQANAFAADgAOAA4ADQANACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwBQAFAAUABQAFAAUABQAFAAUAArAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAABAAEAAQABAAEAAQABAAEACsABAAEAAQABAAEAAQABAAEAFAADQANAA0ADQANACsAKwArACsAKwArACsAKwArACsASwBLAEsASwBLAEsASwBLAEsASwBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAArACsAKwAOABMAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAKwArAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAArAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAArACsAKwArACsAKwArACsAKwBQAFAAUABQAFAAUABQACsAUABQACsAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAEAAQABAAEAAQABAArACsAKwAEACsABAAEACsABAAEAAQABAAEAAQABABQAAQAKwArACsAKwArACsAKwArAEsASwBLAEsASwBLAEsASwBLAEsAKwArACsAKwArACsAUABQAFAAUABQAFAAKwBQAFAAKwBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAEAAQABAAEAAQAKwAEAAQAKwAEAAQABAAEAAQAUAArACsAKwArACsAKwArAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAABAAEAAQABAAeAB4AKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwBQACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAB4AHgAeAB4AHgAeAB4AHgAaABoAGgAaAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgArACsAKwArACsAKwArACsAKwArACsAKwArAA0AUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQACsAKwArACsAKwArAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQACsADQANAA0ADQANACsAKwArACsAKwArACsAKwArACsAKwBQAFAAUABQACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAASABIAEgAQwBDAEMAUABQAFAAUABDAFAAUABQAEgAQwBIAEMAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAASABDAEMAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAKwAJAAkACQAJAAkACQAJABYAEQArACsAKwArACsAKwArAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABIAEMAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArAEsASwBLAEsASwBLAEsASwBLAEsAKwArACsAKwANAA0AKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAKwArAAQABAAEAAQABAANACsAKwArACsAKwArACsAKwArACsAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAEAAQABAAEAAQABAAEAA0ADQANAB4AHgAeAB4AHgAeAFAAUABQAFAADQAeACsAKwArACsAKwArACsAKwArACsASwBLAEsASwBLAEsASwBLAEsASwArAFAAUABQAFAAUABQAFAAKwBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAArACsAKwArACsAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAANAA0AHgAeACsAKwArACsAKwBQAFAAUABQAFAAUABQAFAAUABQAFAAKwArACsAKwAEAFAABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQAKwArACsAKwArACsAKwAEAAQABAAEAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAARwBHABUARwAJACsAKwArACsAKwArACsAKwArACsAKwAEAAQAKwArACsAKwArACsAKwArACsAKwArACsAKwArAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXACsAKwArACsAKwArACsAKwBXAFcAVwBXAFcAVwBXAFcAVwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAUQBRAFEAKwArACsAKwArACsAKwArACsAKwArACsAKwBRAFEAUQBRACsAKwArACsAKwArACsAKwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXACsAKwArACsAUABQAFAAUABQAFAAUABQAFAAUABQACsAKwArACsAKwBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQACsAKwArACsAKwArACsAUABQAFAAUABQAFAAUABQAFAAUAArACsAHgAEAAQADQAEAAQABAAEACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgArACsAKwArACsAKwArACsAKwArAB4AHgAeAB4AHgAeAB4AKwArAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAAQABAAEAAQABAAeAB4AHgAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAB4AHgAEAAQABAAEAAQABAAEAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4ABAAEAAQABAAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4ABAAEAAQAHgArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQACsAKwArACsAKwArACsAKwArACsAKwArAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgArACsAKwArACsAKwArACsAKwAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgArAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AKwBQAFAAKwArAFAAKwArAFAAUAArACsAUABQAFAAUAArAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeACsAUAArAFAAUABQAFAAUABQAFAAKwAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AKwBQAFAAUABQACsAKwBQAFAAUABQAFAAUABQAFAAKwBQAFAAUABQAFAAUABQACsAHgAeAFAAUABQAFAAUAArAFAAKwArACsAUABQAFAAUABQAFAAUAArAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AKwArAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAHgBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgBQAFAAUABQAFAAUABQAFAAUABQAFAAHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAB4AHgAeAB4AHgAeAB4AHgAeACsAKwBLAEsASwBLAEsASwBLAEsASwBLAEsASwBLAEsASwBLAEsASwBLAEsASwBLAEsASwBLAEsASwBLAEsASwBLAEsASwBLAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAeAB4AHgAeAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAeAB4AHgAeAB4AHgAeAB4ABAAeAB4AHgAeAB4AHgAeAB4AHgAeAAQAHgAeAA0ADQANAA0AHgArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwAEAAQABAAEAAQAKwAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArAAQABAAEAAQABAAEAAQAKwAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQAKwArAAQABAAEAAQABAAEAAQAKwAEAAQAKwAEAAQABAAEAAQAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAArACsAKwAEAAQABAAEAAQABAAEAFAAUABQAFAAUABQAFAAKwArAEsASwBLAEsASwBLAEsASwBLAEsAKwArACsAKwBQAB4AKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwBQAFAAUABQAFAAUABQAFAAUABQAFAAUAAEAAQABAAEAEsASwBLAEsASwBLAEsASwBLAEsAKwArACsAKwArABsAUABQAFAAUABQACsAKwBQAFAAUABQAFAAUABQAFAAUAAEAAQABAAEAAQABAAEACsAKwArACsAKwArACsAKwArAB4AHgAeAB4ABAAEAAQABAAEAAQABABQACsAKwArACsASwBLAEsASwBLAEsASwBLAEsASwArACsAKwArABYAFgArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAGgBQAFAAUAAaAFAAUABQAFAAKwArACsAKwArACsAKwArACsAKwArAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAeAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQACsAKwBQAFAAUABQACsAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAKwBQAFAAKwBQACsAKwBQACsAUABQAFAAUABQAFAAUABQAFAAUAArAFAAUABQAFAAKwBQACsAUAArACsAKwArACsAKwBQACsAKwArACsAUAArAFAAKwBQACsAUABQAFAAKwBQAFAAKwBQACsAKwBQACsAUAArAFAAKwBQACsAUAArAFAAUAArAFAAKwArAFAAUABQAFAAKwBQAFAAUABQAFAAUABQACsAUABQAFAAUAArAFAAUABQAFAAKwBQACsAUABQAFAAUABQAFAAUABQAFAAUAArAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAArACsAKwArACsAUABQAFAAKwBQAFAAUABQAFAAKwBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwAeAB4AKwArACsAKwArACsAKwArACsAKwArACsAKwArAE8ATwBPAE8ATwBPAE8ATwBPAE8ATwBPAE8AJQAlACUAHQAdAB0AHQAdAB0AHQAdAB0AHQAdAB0AHQAdAB0AHQAdAB0AHgAeAB0AHQAdAB0AHQAdAB0AHQAdAB0AHQAdAB0AHQAdAB0AHQAdAB4AHgAeACUAJQAlAB0AHQAdAB0AHQAdAB0AHQAdAB0AHQAdAB0AHQAdAB0AHQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAJQAlACUAJQAlACAAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAeAB4AJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlAB4AHgAlACUAJQAlACUAHgAlACUAJQAlACUAIAAgACAAJQAlACAAJQAlACAAIAAgACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACEAIQAhACEAIQAlACUAIAAgACUAJQAgACAAIAAgACAAIAAgACAAIAAgACAAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAJQAlACUAIAAlACUAJQAlACAAIAAgACUAIAAgACAAJQAlACUAJQAlACUAJQAgACUAIAAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAHgAlAB4AJQAeACUAJQAlACUAJQAgACUAJQAlACUAHgAlAB4AHgAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlAB4AHgAeAB4AHgAeAB4AJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAeAB4AHgAeAB4AHgAeAB4AHgAeACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACAAIAAlACUAJQAlACAAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACAAJQAlACUAJQAgACAAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAHgAeAB4AHgAeAB4AHgAeACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAeAB4AHgAeAB4AHgAlACUAJQAlACUAJQAlACAAIAAgACUAJQAlACAAIAAgACAAIAAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeABcAFwAXABUAFQAVAB4AHgAeAB4AJQAlACUAIAAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACAAIAAgACUAJQAlACUAJQAlACUAJQAlACAAJQAlACUAJQAlACUAJQAlACUAJQAlACAAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AJQAlACUAJQAlACUAJQAlACUAJQAlACUAHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AJQAlACUAJQAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeACUAJQAlACUAJQAlACUAJQAeAB4AHgAeAB4AHgAeAB4AHgAeACUAJQAlACUAJQAlAB4AHgAeAB4AHgAeAB4AHgAlACUAJQAlACUAJQAlACUAHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAgACUAJQAgACUAJQAlACUAJQAlACUAJQAgACAAIAAgACAAIAAgACAAJQAlACUAJQAlACUAIAAlACUAJQAlACUAJQAlACUAJQAgACAAIAAgACAAIAAgACAAIAAgACUAJQAgACAAIAAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAgACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACAAIAAlACAAIAAlACAAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAgACAAIAAlACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAJQAlAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AKwAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArAEsASwBLAEsASwBLAEsASwBLAEsAKwArACsAKwArACsAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAKwArAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXACUAJQBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwAlACUAJQAlACUAJQAlACUAJQAlACUAVwBXACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQBXAFcAVwBXAFcAVwBXAFcAVwBXAFcAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAJQAlACUAKwAEACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArACsAKwArAA==";
      LETTER_NUMBER_MODIFIER = 50;
      BK = 1;
      CR$1 = 2;
      LF$1 = 3;
      CM = 4;
      NL = 5;
      WJ = 7;
      ZW = 8;
      GL = 9;
      SP = 10;
      ZWJ$1 = 11;
      B2 = 12;
      BA = 13;
      BB = 14;
      HY = 15;
      CB = 16;
      CL = 17;
      CP = 18;
      EX = 19;
      IN = 20;
      NS = 21;
      OP = 22;
      QU = 23;
      IS = 24;
      NU = 25;
      PO = 26;
      PR = 27;
      SY = 28;
      AI = 29;
      AL = 30;
      CJ = 31;
      EB = 32;
      EM = 33;
      H2 = 34;
      H3 = 35;
      HL = 36;
      ID = 37;
      JL = 38;
      JV = 39;
      JT = 40;
      RI$1 = 41;
      SA = 42;
      XX = 43;
      ea_OP = [9001, 65288];
      BREAK_MANDATORY = "!";
      BREAK_NOT_ALLOWED$1 = "\xD7";
      BREAK_ALLOWED$1 = "\xF7";
      UnicodeTrie$1 = createTrieFromBase64$1(base64$1);
      ALPHABETICS = [AL, HL];
      HARD_LINE_BREAKS = [BK, CR$1, LF$1, NL];
      SPACE$1 = [SP, ZW];
      PREFIX_POSTFIX = [PR, PO];
      LINE_BREAKS = HARD_LINE_BREAKS.concat(SPACE$1);
      KOREAN_SYLLABLE_BLOCK = [JL, JV, JT, H2, H3];
      HYPHEN = [HY, BA];
      codePointsToCharacterClasses = function(codePoints, lineBreak2) {
        if (lineBreak2 === void 0) {
          lineBreak2 = "strict";
        }
        var types = [];
        var indices = [];
        var categories = [];
        codePoints.forEach(function(codePoint, index) {
          var classType = UnicodeTrie$1.get(codePoint);
          if (classType > LETTER_NUMBER_MODIFIER) {
            categories.push(true);
            classType -= LETTER_NUMBER_MODIFIER;
          } else {
            categories.push(false);
          }
          if (["normal", "auto", "loose"].indexOf(lineBreak2) !== -1) {
            if ([8208, 8211, 12316, 12448].indexOf(codePoint) !== -1) {
              indices.push(index);
              return types.push(CB);
            }
          }
          if (classType === CM || classType === ZWJ$1) {
            if (index === 0) {
              indices.push(index);
              return types.push(AL);
            }
            var prev = types[index - 1];
            if (LINE_BREAKS.indexOf(prev) === -1) {
              indices.push(indices[index - 1]);
              return types.push(prev);
            }
            indices.push(index);
            return types.push(AL);
          }
          indices.push(index);
          if (classType === CJ) {
            return types.push(lineBreak2 === "strict" ? NS : ID);
          }
          if (classType === SA) {
            return types.push(AL);
          }
          if (classType === AI) {
            return types.push(AL);
          }
          if (classType === XX) {
            if (codePoint >= 131072 && codePoint <= 196605 || codePoint >= 196608 && codePoint <= 262141) {
              return types.push(ID);
            } else {
              return types.push(AL);
            }
          }
          types.push(classType);
        });
        return [indices, types, categories];
      };
      isAdjacentWithSpaceIgnored = function(a2, b, currentIndex, classTypes) {
        var current = classTypes[currentIndex];
        if (Array.isArray(a2) ? a2.indexOf(current) !== -1 : a2 === current) {
          var i = currentIndex;
          while (i <= classTypes.length) {
            i++;
            var next = classTypes[i];
            if (next === b) {
              return true;
            }
            if (next !== SP) {
              break;
            }
          }
        }
        if (current === SP) {
          var i = currentIndex;
          while (i > 0) {
            i--;
            var prev = classTypes[i];
            if (Array.isArray(a2) ? a2.indexOf(prev) !== -1 : a2 === prev) {
              var n = currentIndex;
              while (n <= classTypes.length) {
                n++;
                var next = classTypes[n];
                if (next === b) {
                  return true;
                }
                if (next !== SP) {
                  break;
                }
              }
            }
            if (prev !== SP) {
              break;
            }
          }
        }
        return false;
      };
      previousNonSpaceClassType = function(currentIndex, classTypes) {
        var i = currentIndex;
        while (i >= 0) {
          var type = classTypes[i];
          if (type === SP) {
            i--;
          } else {
            return type;
          }
        }
        return 0;
      };
      _lineBreakAtIndex = function(codePoints, classTypes, indicies, index, forbiddenBreaks) {
        if (indicies[index] === 0) {
          return BREAK_NOT_ALLOWED$1;
        }
        var currentIndex = index - 1;
        if (Array.isArray(forbiddenBreaks) && forbiddenBreaks[currentIndex] === true) {
          return BREAK_NOT_ALLOWED$1;
        }
        var beforeIndex = currentIndex - 1;
        var afterIndex = currentIndex + 1;
        var current = classTypes[currentIndex];
        var before = beforeIndex >= 0 ? classTypes[beforeIndex] : 0;
        var next = classTypes[afterIndex];
        if (current === CR$1 && next === LF$1) {
          return BREAK_NOT_ALLOWED$1;
        }
        if (HARD_LINE_BREAKS.indexOf(current) !== -1) {
          return BREAK_MANDATORY;
        }
        if (HARD_LINE_BREAKS.indexOf(next) !== -1) {
          return BREAK_NOT_ALLOWED$1;
        }
        if (SPACE$1.indexOf(next) !== -1) {
          return BREAK_NOT_ALLOWED$1;
        }
        if (previousNonSpaceClassType(currentIndex, classTypes) === ZW) {
          return BREAK_ALLOWED$1;
        }
        if (UnicodeTrie$1.get(codePoints[currentIndex]) === ZWJ$1) {
          return BREAK_NOT_ALLOWED$1;
        }
        if ((current === EB || current === EM) && UnicodeTrie$1.get(codePoints[afterIndex]) === ZWJ$1) {
          return BREAK_NOT_ALLOWED$1;
        }
        if (current === WJ || next === WJ) {
          return BREAK_NOT_ALLOWED$1;
        }
        if (current === GL) {
          return BREAK_NOT_ALLOWED$1;
        }
        if ([SP, BA, HY].indexOf(current) === -1 && next === GL) {
          return BREAK_NOT_ALLOWED$1;
        }
        if ([CL, CP, EX, IS, SY].indexOf(next) !== -1) {
          return BREAK_NOT_ALLOWED$1;
        }
        if (previousNonSpaceClassType(currentIndex, classTypes) === OP) {
          return BREAK_NOT_ALLOWED$1;
        }
        if (isAdjacentWithSpaceIgnored(QU, OP, currentIndex, classTypes)) {
          return BREAK_NOT_ALLOWED$1;
        }
        if (isAdjacentWithSpaceIgnored([CL, CP], NS, currentIndex, classTypes)) {
          return BREAK_NOT_ALLOWED$1;
        }
        if (isAdjacentWithSpaceIgnored(B2, B2, currentIndex, classTypes)) {
          return BREAK_NOT_ALLOWED$1;
        }
        if (current === SP) {
          return BREAK_ALLOWED$1;
        }
        if (current === QU || next === QU) {
          return BREAK_NOT_ALLOWED$1;
        }
        if (next === CB || current === CB) {
          return BREAK_ALLOWED$1;
        }
        if ([BA, HY, NS].indexOf(next) !== -1 || current === BB) {
          return BREAK_NOT_ALLOWED$1;
        }
        if (before === HL && HYPHEN.indexOf(current) !== -1) {
          return BREAK_NOT_ALLOWED$1;
        }
        if (current === SY && next === HL) {
          return BREAK_NOT_ALLOWED$1;
        }
        if (next === IN) {
          return BREAK_NOT_ALLOWED$1;
        }
        if (ALPHABETICS.indexOf(next) !== -1 && current === NU || ALPHABETICS.indexOf(current) !== -1 && next === NU) {
          return BREAK_NOT_ALLOWED$1;
        }
        if (current === PR && [ID, EB, EM].indexOf(next) !== -1 || [ID, EB, EM].indexOf(current) !== -1 && next === PO) {
          return BREAK_NOT_ALLOWED$1;
        }
        if (ALPHABETICS.indexOf(current) !== -1 && PREFIX_POSTFIX.indexOf(next) !== -1 || PREFIX_POSTFIX.indexOf(current) !== -1 && ALPHABETICS.indexOf(next) !== -1) {
          return BREAK_NOT_ALLOWED$1;
        }
        if (
          // (PR | PO) × ( OP | HY )? NU
          [PR, PO].indexOf(current) !== -1 && (next === NU || [OP, HY].indexOf(next) !== -1 && classTypes[afterIndex + 1] === NU) || // ( OP | HY ) × NU
          [OP, HY].indexOf(current) !== -1 && next === NU || // NU ×	(NU | SY | IS)
          current === NU && [NU, SY, IS].indexOf(next) !== -1
        ) {
          return BREAK_NOT_ALLOWED$1;
        }
        if ([NU, SY, IS, CL, CP].indexOf(next) !== -1) {
          var prevIndex = currentIndex;
          while (prevIndex >= 0) {
            var type = classTypes[prevIndex];
            if (type === NU) {
              return BREAK_NOT_ALLOWED$1;
            } else if ([SY, IS].indexOf(type) !== -1) {
              prevIndex--;
            } else {
              break;
            }
          }
        }
        if ([PR, PO].indexOf(next) !== -1) {
          var prevIndex = [CL, CP].indexOf(current) !== -1 ? beforeIndex : currentIndex;
          while (prevIndex >= 0) {
            var type = classTypes[prevIndex];
            if (type === NU) {
              return BREAK_NOT_ALLOWED$1;
            } else if ([SY, IS].indexOf(type) !== -1) {
              prevIndex--;
            } else {
              break;
            }
          }
        }
        if (JL === current && [JL, JV, H2, H3].indexOf(next) !== -1 || [JV, H2].indexOf(current) !== -1 && [JV, JT].indexOf(next) !== -1 || [JT, H3].indexOf(current) !== -1 && next === JT) {
          return BREAK_NOT_ALLOWED$1;
        }
        if (KOREAN_SYLLABLE_BLOCK.indexOf(current) !== -1 && [IN, PO].indexOf(next) !== -1 || KOREAN_SYLLABLE_BLOCK.indexOf(next) !== -1 && current === PR) {
          return BREAK_NOT_ALLOWED$1;
        }
        if (ALPHABETICS.indexOf(current) !== -1 && ALPHABETICS.indexOf(next) !== -1) {
          return BREAK_NOT_ALLOWED$1;
        }
        if (current === IS && ALPHABETICS.indexOf(next) !== -1) {
          return BREAK_NOT_ALLOWED$1;
        }
        if (ALPHABETICS.concat(NU).indexOf(current) !== -1 && next === OP && ea_OP.indexOf(codePoints[afterIndex]) === -1 || ALPHABETICS.concat(NU).indexOf(next) !== -1 && current === CP) {
          return BREAK_NOT_ALLOWED$1;
        }
        if (current === RI$1 && next === RI$1) {
          var i = indicies[currentIndex];
          var count = 1;
          while (i > 0) {
            i--;
            if (classTypes[i] === RI$1) {
              count++;
            } else {
              break;
            }
          }
          if (count % 2 !== 0) {
            return BREAK_NOT_ALLOWED$1;
          }
        }
        if (current === EB && next === EM) {
          return BREAK_NOT_ALLOWED$1;
        }
        return BREAK_ALLOWED$1;
      };
      cssFormattedClasses = function(codePoints, options) {
        if (!options) {
          options = { lineBreak: "normal", wordBreak: "normal" };
        }
        var _a = codePointsToCharacterClasses(codePoints, options.lineBreak), indicies = _a[0], classTypes = _a[1], isLetterNumber = _a[2];
        if (options.wordBreak === "break-all" || options.wordBreak === "break-word") {
          classTypes = classTypes.map(function(type) {
            return [NU, AL, SA].indexOf(type) !== -1 ? ID : type;
          });
        }
        var forbiddenBreakpoints = options.wordBreak === "keep-all" ? isLetterNumber.map(function(letterNumber, i) {
          return letterNumber && codePoints[i] >= 19968 && codePoints[i] <= 40959;
        }) : void 0;
        return [indicies, classTypes, forbiddenBreakpoints];
      };
      Break = /** @class */
      (function() {
        function Break2(codePoints, lineBreak2, start, end) {
          this.codePoints = codePoints;
          this.required = lineBreak2 === BREAK_MANDATORY;
          this.start = start;
          this.end = end;
        }
        Break2.prototype.slice = function() {
          return fromCodePoint$1.apply(void 0, this.codePoints.slice(this.start, this.end));
        };
        return Break2;
      })();
      LineBreaker = function(str, options) {
        var codePoints = toCodePoints$1(str);
        var _a = cssFormattedClasses(codePoints, options), indicies = _a[0], classTypes = _a[1], forbiddenBreakpoints = _a[2];
        var length = codePoints.length;
        var lastEnd = 0;
        var nextIndex = 0;
        return {
          next: function() {
            if (nextIndex >= length) {
              return { done: true, value: null };
            }
            var lineBreak2 = BREAK_NOT_ALLOWED$1;
            while (nextIndex < length && (lineBreak2 = _lineBreakAtIndex(codePoints, classTypes, indicies, ++nextIndex, forbiddenBreakpoints)) === BREAK_NOT_ALLOWED$1) {
            }
            if (lineBreak2 !== BREAK_NOT_ALLOWED$1 || nextIndex === length) {
              var value = new Break(codePoints, lineBreak2, lastEnd, nextIndex);
              lastEnd = nextIndex;
              return { value, done: false };
            }
            return { done: true, value: null };
          }
        };
      };
      FLAG_UNRESTRICTED = 1 << 0;
      FLAG_ID = 1 << 1;
      FLAG_INTEGER = 1 << 2;
      FLAG_NUMBER = 1 << 3;
      LINE_FEED = 10;
      SOLIDUS = 47;
      REVERSE_SOLIDUS = 92;
      CHARACTER_TABULATION = 9;
      SPACE = 32;
      QUOTATION_MARK = 34;
      EQUALS_SIGN = 61;
      NUMBER_SIGN = 35;
      DOLLAR_SIGN = 36;
      PERCENTAGE_SIGN = 37;
      APOSTROPHE = 39;
      LEFT_PARENTHESIS = 40;
      RIGHT_PARENTHESIS = 41;
      LOW_LINE = 95;
      HYPHEN_MINUS = 45;
      EXCLAMATION_MARK = 33;
      LESS_THAN_SIGN = 60;
      GREATER_THAN_SIGN = 62;
      COMMERCIAL_AT = 64;
      LEFT_SQUARE_BRACKET = 91;
      RIGHT_SQUARE_BRACKET = 93;
      CIRCUMFLEX_ACCENT = 61;
      LEFT_CURLY_BRACKET = 123;
      QUESTION_MARK = 63;
      RIGHT_CURLY_BRACKET = 125;
      VERTICAL_LINE = 124;
      TILDE = 126;
      CONTROL = 128;
      REPLACEMENT_CHARACTER = 65533;
      ASTERISK = 42;
      PLUS_SIGN = 43;
      COMMA = 44;
      COLON = 58;
      SEMICOLON = 59;
      FULL_STOP = 46;
      NULL = 0;
      BACKSPACE = 8;
      LINE_TABULATION = 11;
      SHIFT_OUT = 14;
      INFORMATION_SEPARATOR_ONE = 31;
      DELETE = 127;
      EOF = -1;
      ZERO = 48;
      a = 97;
      e = 101;
      f = 102;
      u = 117;
      z = 122;
      A = 65;
      E = 69;
      F = 70;
      U = 85;
      Z = 90;
      isDigit = function(codePoint) {
        return codePoint >= ZERO && codePoint <= 57;
      };
      isSurrogateCodePoint = function(codePoint) {
        return codePoint >= 55296 && codePoint <= 57343;
      };
      isHex = function(codePoint) {
        return isDigit(codePoint) || codePoint >= A && codePoint <= F || codePoint >= a && codePoint <= f;
      };
      isLowerCaseLetter = function(codePoint) {
        return codePoint >= a && codePoint <= z;
      };
      isUpperCaseLetter = function(codePoint) {
        return codePoint >= A && codePoint <= Z;
      };
      isLetter = function(codePoint) {
        return isLowerCaseLetter(codePoint) || isUpperCaseLetter(codePoint);
      };
      isNonASCIICodePoint = function(codePoint) {
        return codePoint >= CONTROL;
      };
      isWhiteSpace = function(codePoint) {
        return codePoint === LINE_FEED || codePoint === CHARACTER_TABULATION || codePoint === SPACE;
      };
      isNameStartCodePoint = function(codePoint) {
        return isLetter(codePoint) || isNonASCIICodePoint(codePoint) || codePoint === LOW_LINE;
      };
      isNameCodePoint = function(codePoint) {
        return isNameStartCodePoint(codePoint) || isDigit(codePoint) || codePoint === HYPHEN_MINUS;
      };
      isNonPrintableCodePoint = function(codePoint) {
        return codePoint >= NULL && codePoint <= BACKSPACE || codePoint === LINE_TABULATION || codePoint >= SHIFT_OUT && codePoint <= INFORMATION_SEPARATOR_ONE || codePoint === DELETE;
      };
      isValidEscape = function(c1, c2) {
        if (c1 !== REVERSE_SOLIDUS) {
          return false;
        }
        return c2 !== LINE_FEED;
      };
      isIdentifierStart = function(c1, c2, c3) {
        if (c1 === HYPHEN_MINUS) {
          return isNameStartCodePoint(c2) || isValidEscape(c2, c3);
        } else if (isNameStartCodePoint(c1)) {
          return true;
        } else if (c1 === REVERSE_SOLIDUS && isValidEscape(c1, c2)) {
          return true;
        }
        return false;
      };
      isNumberStart = function(c1, c2, c3) {
        if (c1 === PLUS_SIGN || c1 === HYPHEN_MINUS) {
          if (isDigit(c2)) {
            return true;
          }
          return c2 === FULL_STOP && isDigit(c3);
        }
        if (c1 === FULL_STOP) {
          return isDigit(c2);
        }
        return isDigit(c1);
      };
      stringToNumber = function(codePoints) {
        var c = 0;
        var sign = 1;
        if (codePoints[c] === PLUS_SIGN || codePoints[c] === HYPHEN_MINUS) {
          if (codePoints[c] === HYPHEN_MINUS) {
            sign = -1;
          }
          c++;
        }
        var integers = [];
        while (isDigit(codePoints[c])) {
          integers.push(codePoints[c++]);
        }
        var int = integers.length ? parseInt(fromCodePoint$1.apply(void 0, integers), 10) : 0;
        if (codePoints[c] === FULL_STOP) {
          c++;
        }
        var fraction = [];
        while (isDigit(codePoints[c])) {
          fraction.push(codePoints[c++]);
        }
        var fracd = fraction.length;
        var frac = fracd ? parseInt(fromCodePoint$1.apply(void 0, fraction), 10) : 0;
        if (codePoints[c] === E || codePoints[c] === e) {
          c++;
        }
        var expsign = 1;
        if (codePoints[c] === PLUS_SIGN || codePoints[c] === HYPHEN_MINUS) {
          if (codePoints[c] === HYPHEN_MINUS) {
            expsign = -1;
          }
          c++;
        }
        var exponent = [];
        while (isDigit(codePoints[c])) {
          exponent.push(codePoints[c++]);
        }
        var exp = exponent.length ? parseInt(fromCodePoint$1.apply(void 0, exponent), 10) : 0;
        return sign * (int + frac * Math.pow(10, -fracd)) * Math.pow(10, expsign * exp);
      };
      LEFT_PARENTHESIS_TOKEN = {
        type: 2
        /* LEFT_PARENTHESIS_TOKEN */
      };
      RIGHT_PARENTHESIS_TOKEN = {
        type: 3
        /* RIGHT_PARENTHESIS_TOKEN */
      };
      COMMA_TOKEN = {
        type: 4
        /* COMMA_TOKEN */
      };
      SUFFIX_MATCH_TOKEN = {
        type: 13
        /* SUFFIX_MATCH_TOKEN */
      };
      PREFIX_MATCH_TOKEN = {
        type: 8
        /* PREFIX_MATCH_TOKEN */
      };
      COLUMN_TOKEN = {
        type: 21
        /* COLUMN_TOKEN */
      };
      DASH_MATCH_TOKEN = {
        type: 9
        /* DASH_MATCH_TOKEN */
      };
      INCLUDE_MATCH_TOKEN = {
        type: 10
        /* INCLUDE_MATCH_TOKEN */
      };
      LEFT_CURLY_BRACKET_TOKEN = {
        type: 11
        /* LEFT_CURLY_BRACKET_TOKEN */
      };
      RIGHT_CURLY_BRACKET_TOKEN = {
        type: 12
        /* RIGHT_CURLY_BRACKET_TOKEN */
      };
      SUBSTRING_MATCH_TOKEN = {
        type: 14
        /* SUBSTRING_MATCH_TOKEN */
      };
      BAD_URL_TOKEN = {
        type: 23
        /* BAD_URL_TOKEN */
      };
      BAD_STRING_TOKEN = {
        type: 1
        /* BAD_STRING_TOKEN */
      };
      CDO_TOKEN = {
        type: 25
        /* CDO_TOKEN */
      };
      CDC_TOKEN = {
        type: 24
        /* CDC_TOKEN */
      };
      COLON_TOKEN = {
        type: 26
        /* COLON_TOKEN */
      };
      SEMICOLON_TOKEN = {
        type: 27
        /* SEMICOLON_TOKEN */
      };
      LEFT_SQUARE_BRACKET_TOKEN = {
        type: 28
        /* LEFT_SQUARE_BRACKET_TOKEN */
      };
      RIGHT_SQUARE_BRACKET_TOKEN = {
        type: 29
        /* RIGHT_SQUARE_BRACKET_TOKEN */
      };
      WHITESPACE_TOKEN = {
        type: 31
        /* WHITESPACE_TOKEN */
      };
      EOF_TOKEN = {
        type: 32
        /* EOF_TOKEN */
      };
      Tokenizer = /** @class */
      (function() {
        function Tokenizer2() {
          this._value = [];
        }
        Tokenizer2.prototype.write = function(chunk) {
          this._value = this._value.concat(toCodePoints$1(chunk));
        };
        Tokenizer2.prototype.read = function() {
          var tokens = [];
          var token = this.consumeToken();
          while (token !== EOF_TOKEN) {
            tokens.push(token);
            token = this.consumeToken();
          }
          return tokens;
        };
        Tokenizer2.prototype.consumeToken = function() {
          var codePoint = this.consumeCodePoint();
          switch (codePoint) {
            case QUOTATION_MARK:
              return this.consumeStringToken(QUOTATION_MARK);
            case NUMBER_SIGN:
              var c1 = this.peekCodePoint(0);
              var c2 = this.peekCodePoint(1);
              var c3 = this.peekCodePoint(2);
              if (isNameCodePoint(c1) || isValidEscape(c2, c3)) {
                var flags = isIdentifierStart(c1, c2, c3) ? FLAG_ID : FLAG_UNRESTRICTED;
                var value = this.consumeName();
                return { type: 5, value, flags };
              }
              break;
            case DOLLAR_SIGN:
              if (this.peekCodePoint(0) === EQUALS_SIGN) {
                this.consumeCodePoint();
                return SUFFIX_MATCH_TOKEN;
              }
              break;
            case APOSTROPHE:
              return this.consumeStringToken(APOSTROPHE);
            case LEFT_PARENTHESIS:
              return LEFT_PARENTHESIS_TOKEN;
            case RIGHT_PARENTHESIS:
              return RIGHT_PARENTHESIS_TOKEN;
            case ASTERISK:
              if (this.peekCodePoint(0) === EQUALS_SIGN) {
                this.consumeCodePoint();
                return SUBSTRING_MATCH_TOKEN;
              }
              break;
            case PLUS_SIGN:
              if (isNumberStart(codePoint, this.peekCodePoint(0), this.peekCodePoint(1))) {
                this.reconsumeCodePoint(codePoint);
                return this.consumeNumericToken();
              }
              break;
            case COMMA:
              return COMMA_TOKEN;
            case HYPHEN_MINUS:
              var e1 = codePoint;
              var e2 = this.peekCodePoint(0);
              var e3 = this.peekCodePoint(1);
              if (isNumberStart(e1, e2, e3)) {
                this.reconsumeCodePoint(codePoint);
                return this.consumeNumericToken();
              }
              if (isIdentifierStart(e1, e2, e3)) {
                this.reconsumeCodePoint(codePoint);
                return this.consumeIdentLikeToken();
              }
              if (e2 === HYPHEN_MINUS && e3 === GREATER_THAN_SIGN) {
                this.consumeCodePoint();
                this.consumeCodePoint();
                return CDC_TOKEN;
              }
              break;
            case FULL_STOP:
              if (isNumberStart(codePoint, this.peekCodePoint(0), this.peekCodePoint(1))) {
                this.reconsumeCodePoint(codePoint);
                return this.consumeNumericToken();
              }
              break;
            case SOLIDUS:
              if (this.peekCodePoint(0) === ASTERISK) {
                this.consumeCodePoint();
                while (true) {
                  var c = this.consumeCodePoint();
                  if (c === ASTERISK) {
                    c = this.consumeCodePoint();
                    if (c === SOLIDUS) {
                      return this.consumeToken();
                    }
                  }
                  if (c === EOF) {
                    return this.consumeToken();
                  }
                }
              }
              break;
            case COLON:
              return COLON_TOKEN;
            case SEMICOLON:
              return SEMICOLON_TOKEN;
            case LESS_THAN_SIGN:
              if (this.peekCodePoint(0) === EXCLAMATION_MARK && this.peekCodePoint(1) === HYPHEN_MINUS && this.peekCodePoint(2) === HYPHEN_MINUS) {
                this.consumeCodePoint();
                this.consumeCodePoint();
                return CDO_TOKEN;
              }
              break;
            case COMMERCIAL_AT:
              var a1 = this.peekCodePoint(0);
              var a2 = this.peekCodePoint(1);
              var a3 = this.peekCodePoint(2);
              if (isIdentifierStart(a1, a2, a3)) {
                var value = this.consumeName();
                return { type: 7, value };
              }
              break;
            case LEFT_SQUARE_BRACKET:
              return LEFT_SQUARE_BRACKET_TOKEN;
            case REVERSE_SOLIDUS:
              if (isValidEscape(codePoint, this.peekCodePoint(0))) {
                this.reconsumeCodePoint(codePoint);
                return this.consumeIdentLikeToken();
              }
              break;
            case RIGHT_SQUARE_BRACKET:
              return RIGHT_SQUARE_BRACKET_TOKEN;
            case CIRCUMFLEX_ACCENT:
              if (this.peekCodePoint(0) === EQUALS_SIGN) {
                this.consumeCodePoint();
                return PREFIX_MATCH_TOKEN;
              }
              break;
            case LEFT_CURLY_BRACKET:
              return LEFT_CURLY_BRACKET_TOKEN;
            case RIGHT_CURLY_BRACKET:
              return RIGHT_CURLY_BRACKET_TOKEN;
            case u:
            case U:
              var u1 = this.peekCodePoint(0);
              var u2 = this.peekCodePoint(1);
              if (u1 === PLUS_SIGN && (isHex(u2) || u2 === QUESTION_MARK)) {
                this.consumeCodePoint();
                this.consumeUnicodeRangeToken();
              }
              this.reconsumeCodePoint(codePoint);
              return this.consumeIdentLikeToken();
            case VERTICAL_LINE:
              if (this.peekCodePoint(0) === EQUALS_SIGN) {
                this.consumeCodePoint();
                return DASH_MATCH_TOKEN;
              }
              if (this.peekCodePoint(0) === VERTICAL_LINE) {
                this.consumeCodePoint();
                return COLUMN_TOKEN;
              }
              break;
            case TILDE:
              if (this.peekCodePoint(0) === EQUALS_SIGN) {
                this.consumeCodePoint();
                return INCLUDE_MATCH_TOKEN;
              }
              break;
            case EOF:
              return EOF_TOKEN;
          }
          if (isWhiteSpace(codePoint)) {
            this.consumeWhiteSpace();
            return WHITESPACE_TOKEN;
          }
          if (isDigit(codePoint)) {
            this.reconsumeCodePoint(codePoint);
            return this.consumeNumericToken();
          }
          if (isNameStartCodePoint(codePoint)) {
            this.reconsumeCodePoint(codePoint);
            return this.consumeIdentLikeToken();
          }
          return { type: 6, value: fromCodePoint$1(codePoint) };
        };
        Tokenizer2.prototype.consumeCodePoint = function() {
          var value = this._value.shift();
          return typeof value === "undefined" ? -1 : value;
        };
        Tokenizer2.prototype.reconsumeCodePoint = function(codePoint) {
          this._value.unshift(codePoint);
        };
        Tokenizer2.prototype.peekCodePoint = function(delta) {
          if (delta >= this._value.length) {
            return -1;
          }
          return this._value[delta];
        };
        Tokenizer2.prototype.consumeUnicodeRangeToken = function() {
          var digits = [];
          var codePoint = this.consumeCodePoint();
          while (isHex(codePoint) && digits.length < 6) {
            digits.push(codePoint);
            codePoint = this.consumeCodePoint();
          }
          var questionMarks = false;
          while (codePoint === QUESTION_MARK && digits.length < 6) {
            digits.push(codePoint);
            codePoint = this.consumeCodePoint();
            questionMarks = true;
          }
          if (questionMarks) {
            var start_1 = parseInt(fromCodePoint$1.apply(void 0, digits.map(function(digit) {
              return digit === QUESTION_MARK ? ZERO : digit;
            })), 16);
            var end = parseInt(fromCodePoint$1.apply(void 0, digits.map(function(digit) {
              return digit === QUESTION_MARK ? F : digit;
            })), 16);
            return { type: 30, start: start_1, end };
          }
          var start = parseInt(fromCodePoint$1.apply(void 0, digits), 16);
          if (this.peekCodePoint(0) === HYPHEN_MINUS && isHex(this.peekCodePoint(1))) {
            this.consumeCodePoint();
            codePoint = this.consumeCodePoint();
            var endDigits = [];
            while (isHex(codePoint) && endDigits.length < 6) {
              endDigits.push(codePoint);
              codePoint = this.consumeCodePoint();
            }
            var end = parseInt(fromCodePoint$1.apply(void 0, endDigits), 16);
            return { type: 30, start, end };
          } else {
            return { type: 30, start, end: start };
          }
        };
        Tokenizer2.prototype.consumeIdentLikeToken = function() {
          var value = this.consumeName();
          if (value.toLowerCase() === "url" && this.peekCodePoint(0) === LEFT_PARENTHESIS) {
            this.consumeCodePoint();
            return this.consumeUrlToken();
          } else if (this.peekCodePoint(0) === LEFT_PARENTHESIS) {
            this.consumeCodePoint();
            return { type: 19, value };
          }
          return { type: 20, value };
        };
        Tokenizer2.prototype.consumeUrlToken = function() {
          var value = [];
          this.consumeWhiteSpace();
          if (this.peekCodePoint(0) === EOF) {
            return { type: 22, value: "" };
          }
          var next = this.peekCodePoint(0);
          if (next === APOSTROPHE || next === QUOTATION_MARK) {
            var stringToken = this.consumeStringToken(this.consumeCodePoint());
            if (stringToken.type === 0) {
              this.consumeWhiteSpace();
              if (this.peekCodePoint(0) === EOF || this.peekCodePoint(0) === RIGHT_PARENTHESIS) {
                this.consumeCodePoint();
                return { type: 22, value: stringToken.value };
              }
            }
            this.consumeBadUrlRemnants();
            return BAD_URL_TOKEN;
          }
          while (true) {
            var codePoint = this.consumeCodePoint();
            if (codePoint === EOF || codePoint === RIGHT_PARENTHESIS) {
              return { type: 22, value: fromCodePoint$1.apply(void 0, value) };
            } else if (isWhiteSpace(codePoint)) {
              this.consumeWhiteSpace();
              if (this.peekCodePoint(0) === EOF || this.peekCodePoint(0) === RIGHT_PARENTHESIS) {
                this.consumeCodePoint();
                return { type: 22, value: fromCodePoint$1.apply(void 0, value) };
              }
              this.consumeBadUrlRemnants();
              return BAD_URL_TOKEN;
            } else if (codePoint === QUOTATION_MARK || codePoint === APOSTROPHE || codePoint === LEFT_PARENTHESIS || isNonPrintableCodePoint(codePoint)) {
              this.consumeBadUrlRemnants();
              return BAD_URL_TOKEN;
            } else if (codePoint === REVERSE_SOLIDUS) {
              if (isValidEscape(codePoint, this.peekCodePoint(0))) {
                value.push(this.consumeEscapedCodePoint());
              } else {
                this.consumeBadUrlRemnants();
                return BAD_URL_TOKEN;
              }
            } else {
              value.push(codePoint);
            }
          }
        };
        Tokenizer2.prototype.consumeWhiteSpace = function() {
          while (isWhiteSpace(this.peekCodePoint(0))) {
            this.consumeCodePoint();
          }
        };
        Tokenizer2.prototype.consumeBadUrlRemnants = function() {
          while (true) {
            var codePoint = this.consumeCodePoint();
            if (codePoint === RIGHT_PARENTHESIS || codePoint === EOF) {
              return;
            }
            if (isValidEscape(codePoint, this.peekCodePoint(0))) {
              this.consumeEscapedCodePoint();
            }
          }
        };
        Tokenizer2.prototype.consumeStringSlice = function(count) {
          var SLICE_STACK_SIZE = 5e4;
          var value = "";
          while (count > 0) {
            var amount = Math.min(SLICE_STACK_SIZE, count);
            value += fromCodePoint$1.apply(void 0, this._value.splice(0, amount));
            count -= amount;
          }
          this._value.shift();
          return value;
        };
        Tokenizer2.prototype.consumeStringToken = function(endingCodePoint) {
          var value = "";
          var i = 0;
          do {
            var codePoint = this._value[i];
            if (codePoint === EOF || codePoint === void 0 || codePoint === endingCodePoint) {
              value += this.consumeStringSlice(i);
              return { type: 0, value };
            }
            if (codePoint === LINE_FEED) {
              this._value.splice(0, i);
              return BAD_STRING_TOKEN;
            }
            if (codePoint === REVERSE_SOLIDUS) {
              var next = this._value[i + 1];
              if (next !== EOF && next !== void 0) {
                if (next === LINE_FEED) {
                  value += this.consumeStringSlice(i);
                  i = -1;
                  this._value.shift();
                } else if (isValidEscape(codePoint, next)) {
                  value += this.consumeStringSlice(i);
                  value += fromCodePoint$1(this.consumeEscapedCodePoint());
                  i = -1;
                }
              }
            }
            i++;
          } while (true);
        };
        Tokenizer2.prototype.consumeNumber = function() {
          var repr = [];
          var type = FLAG_INTEGER;
          var c1 = this.peekCodePoint(0);
          if (c1 === PLUS_SIGN || c1 === HYPHEN_MINUS) {
            repr.push(this.consumeCodePoint());
          }
          while (isDigit(this.peekCodePoint(0))) {
            repr.push(this.consumeCodePoint());
          }
          c1 = this.peekCodePoint(0);
          var c2 = this.peekCodePoint(1);
          if (c1 === FULL_STOP && isDigit(c2)) {
            repr.push(this.consumeCodePoint(), this.consumeCodePoint());
            type = FLAG_NUMBER;
            while (isDigit(this.peekCodePoint(0))) {
              repr.push(this.consumeCodePoint());
            }
          }
          c1 = this.peekCodePoint(0);
          c2 = this.peekCodePoint(1);
          var c3 = this.peekCodePoint(2);
          if ((c1 === E || c1 === e) && ((c2 === PLUS_SIGN || c2 === HYPHEN_MINUS) && isDigit(c3) || isDigit(c2))) {
            repr.push(this.consumeCodePoint(), this.consumeCodePoint());
            type = FLAG_NUMBER;
            while (isDigit(this.peekCodePoint(0))) {
              repr.push(this.consumeCodePoint());
            }
          }
          return [stringToNumber(repr), type];
        };
        Tokenizer2.prototype.consumeNumericToken = function() {
          var _a = this.consumeNumber(), number = _a[0], flags = _a[1];
          var c1 = this.peekCodePoint(0);
          var c2 = this.peekCodePoint(1);
          var c3 = this.peekCodePoint(2);
          if (isIdentifierStart(c1, c2, c3)) {
            var unit = this.consumeName();
            return { type: 15, number, flags, unit };
          }
          if (c1 === PERCENTAGE_SIGN) {
            this.consumeCodePoint();
            return { type: 16, number, flags };
          }
          return { type: 17, number, flags };
        };
        Tokenizer2.prototype.consumeEscapedCodePoint = function() {
          var codePoint = this.consumeCodePoint();
          if (isHex(codePoint)) {
            var hex = fromCodePoint$1(codePoint);
            while (isHex(this.peekCodePoint(0)) && hex.length < 6) {
              hex += fromCodePoint$1(this.consumeCodePoint());
            }
            if (isWhiteSpace(this.peekCodePoint(0))) {
              this.consumeCodePoint();
            }
            var hexCodePoint = parseInt(hex, 16);
            if (hexCodePoint === 0 || isSurrogateCodePoint(hexCodePoint) || hexCodePoint > 1114111) {
              return REPLACEMENT_CHARACTER;
            }
            return hexCodePoint;
          }
          if (codePoint === EOF) {
            return REPLACEMENT_CHARACTER;
          }
          return codePoint;
        };
        Tokenizer2.prototype.consumeName = function() {
          var result = "";
          while (true) {
            var codePoint = this.consumeCodePoint();
            if (isNameCodePoint(codePoint)) {
              result += fromCodePoint$1(codePoint);
            } else if (isValidEscape(codePoint, this.peekCodePoint(0))) {
              result += fromCodePoint$1(this.consumeEscapedCodePoint());
            } else {
              this.reconsumeCodePoint(codePoint);
              return result;
            }
          }
        };
        return Tokenizer2;
      })();
      Parser = /** @class */
      (function() {
        function Parser2(tokens) {
          this._tokens = tokens;
        }
        Parser2.create = function(value) {
          var tokenizer = new Tokenizer();
          tokenizer.write(value);
          return new Parser2(tokenizer.read());
        };
        Parser2.parseValue = function(value) {
          return Parser2.create(value).parseComponentValue();
        };
        Parser2.parseValues = function(value) {
          return Parser2.create(value).parseComponentValues();
        };
        Parser2.prototype.parseComponentValue = function() {
          var token = this.consumeToken();
          while (token.type === 31) {
            token = this.consumeToken();
          }
          if (token.type === 32) {
            throw new SyntaxError("Error parsing CSS component value, unexpected EOF");
          }
          this.reconsumeToken(token);
          var value = this.consumeComponentValue();
          do {
            token = this.consumeToken();
          } while (token.type === 31);
          if (token.type === 32) {
            return value;
          }
          throw new SyntaxError("Error parsing CSS component value, multiple values found when expecting only one");
        };
        Parser2.prototype.parseComponentValues = function() {
          var values = [];
          while (true) {
            var value = this.consumeComponentValue();
            if (value.type === 32) {
              return values;
            }
            values.push(value);
            values.push();
          }
        };
        Parser2.prototype.consumeComponentValue = function() {
          var token = this.consumeToken();
          switch (token.type) {
            case 11:
            case 28:
            case 2:
              return this.consumeSimpleBlock(token.type);
            case 19:
              return this.consumeFunction(token);
          }
          return token;
        };
        Parser2.prototype.consumeSimpleBlock = function(type) {
          var block = { type, values: [] };
          var token = this.consumeToken();
          while (true) {
            if (token.type === 32 || isEndingTokenFor(token, type)) {
              return block;
            }
            this.reconsumeToken(token);
            block.values.push(this.consumeComponentValue());
            token = this.consumeToken();
          }
        };
        Parser2.prototype.consumeFunction = function(functionToken) {
          var cssFunction = {
            name: functionToken.value,
            values: [],
            type: 18
            /* FUNCTION */
          };
          while (true) {
            var token = this.consumeToken();
            if (token.type === 32 || token.type === 3) {
              return cssFunction;
            }
            this.reconsumeToken(token);
            cssFunction.values.push(this.consumeComponentValue());
          }
        };
        Parser2.prototype.consumeToken = function() {
          var token = this._tokens.shift();
          return typeof token === "undefined" ? EOF_TOKEN : token;
        };
        Parser2.prototype.reconsumeToken = function(token) {
          this._tokens.unshift(token);
        };
        return Parser2;
      })();
      isDimensionToken = function(token) {
        return token.type === 15;
      };
      isNumberToken = function(token) {
        return token.type === 17;
      };
      isIdentToken = function(token) {
        return token.type === 20;
      };
      isStringToken = function(token) {
        return token.type === 0;
      };
      isIdentWithValue = function(token, value) {
        return isIdentToken(token) && token.value === value;
      };
      nonWhiteSpace = function(token) {
        return token.type !== 31;
      };
      nonFunctionArgSeparator = function(token) {
        return token.type !== 31 && token.type !== 4;
      };
      parseFunctionArgs = function(tokens) {
        var args = [];
        var arg = [];
        tokens.forEach(function(token) {
          if (token.type === 4) {
            if (arg.length === 0) {
              throw new Error("Error parsing function args, zero tokens for arg");
            }
            args.push(arg);
            arg = [];
            return;
          }
          if (token.type !== 31) {
            arg.push(token);
          }
        });
        if (arg.length) {
          args.push(arg);
        }
        return args;
      };
      isEndingTokenFor = function(token, type) {
        if (type === 11 && token.type === 12) {
          return true;
        }
        if (type === 28 && token.type === 29) {
          return true;
        }
        return type === 2 && token.type === 3;
      };
      isLength = function(token) {
        return token.type === 17 || token.type === 15;
      };
      isLengthPercentage = function(token) {
        return token.type === 16 || isLength(token);
      };
      parseLengthPercentageTuple = function(tokens) {
        return tokens.length > 1 ? [tokens[0], tokens[1]] : [tokens[0]];
      };
      ZERO_LENGTH = {
        type: 17,
        number: 0,
        flags: FLAG_INTEGER
      };
      FIFTY_PERCENT = {
        type: 16,
        number: 50,
        flags: FLAG_INTEGER
      };
      HUNDRED_PERCENT = {
        type: 16,
        number: 100,
        flags: FLAG_INTEGER
      };
      getAbsoluteValueForTuple = function(tuple, width, height) {
        var x = tuple[0], y = tuple[1];
        return [getAbsoluteValue(x, width), getAbsoluteValue(typeof y !== "undefined" ? y : x, height)];
      };
      getAbsoluteValue = function(token, parent) {
        if (token.type === 16) {
          return token.number / 100 * parent;
        }
        if (isDimensionToken(token)) {
          switch (token.unit) {
            case "rem":
            case "em":
              return 16 * token.number;
            // TODO use correct font-size
            case "px":
            default:
              return token.number;
          }
        }
        return token.number;
      };
      DEG = "deg";
      GRAD = "grad";
      RAD = "rad";
      TURN = "turn";
      angle = {
        name: "angle",
        parse: function(_context, value) {
          if (value.type === 15) {
            switch (value.unit) {
              case DEG:
                return Math.PI * value.number / 180;
              case GRAD:
                return Math.PI / 200 * value.number;
              case RAD:
                return value.number;
              case TURN:
                return Math.PI * 2 * value.number;
            }
          }
          throw new Error("Unsupported angle type");
        }
      };
      isAngle = function(value) {
        if (value.type === 15) {
          if (value.unit === DEG || value.unit === GRAD || value.unit === RAD || value.unit === TURN) {
            return true;
          }
        }
        return false;
      };
      parseNamedSide = function(tokens) {
        var sideOrCorner = tokens.filter(isIdentToken).map(function(ident) {
          return ident.value;
        }).join(" ");
        switch (sideOrCorner) {
          case "to bottom right":
          case "to right bottom":
          case "left top":
          case "top left":
            return [ZERO_LENGTH, ZERO_LENGTH];
          case "to top":
          case "bottom":
            return deg(0);
          case "to bottom left":
          case "to left bottom":
          case "right top":
          case "top right":
            return [ZERO_LENGTH, HUNDRED_PERCENT];
          case "to right":
          case "left":
            return deg(90);
          case "to top left":
          case "to left top":
          case "right bottom":
          case "bottom right":
            return [HUNDRED_PERCENT, HUNDRED_PERCENT];
          case "to bottom":
          case "top":
            return deg(180);
          case "to top right":
          case "to right top":
          case "left bottom":
          case "bottom left":
            return [HUNDRED_PERCENT, ZERO_LENGTH];
          case "to left":
          case "right":
            return deg(270);
        }
        return 0;
      };
      deg = function(deg2) {
        return Math.PI * deg2 / 180;
      };
      color$1 = {
        name: "color",
        parse: function(context, value) {
          if (value.type === 18) {
            var colorFunction = SUPPORTED_COLOR_FUNCTIONS[value.name];
            if (typeof colorFunction === "undefined") {
              throw new Error('Attempting to parse an unsupported color function "' + value.name + '"');
            }
            return colorFunction(context, value.values);
          }
          if (value.type === 5) {
            if (value.value.length === 3) {
              var r = value.value.substring(0, 1);
              var g = value.value.substring(1, 2);
              var b = value.value.substring(2, 3);
              return pack(parseInt(r + r, 16), parseInt(g + g, 16), parseInt(b + b, 16), 1);
            }
            if (value.value.length === 4) {
              var r = value.value.substring(0, 1);
              var g = value.value.substring(1, 2);
              var b = value.value.substring(2, 3);
              var a2 = value.value.substring(3, 4);
              return pack(parseInt(r + r, 16), parseInt(g + g, 16), parseInt(b + b, 16), parseInt(a2 + a2, 16) / 255);
            }
            if (value.value.length === 6) {
              var r = value.value.substring(0, 2);
              var g = value.value.substring(2, 4);
              var b = value.value.substring(4, 6);
              return pack(parseInt(r, 16), parseInt(g, 16), parseInt(b, 16), 1);
            }
            if (value.value.length === 8) {
              var r = value.value.substring(0, 2);
              var g = value.value.substring(2, 4);
              var b = value.value.substring(4, 6);
              var a2 = value.value.substring(6, 8);
              return pack(parseInt(r, 16), parseInt(g, 16), parseInt(b, 16), parseInt(a2, 16) / 255);
            }
          }
          if (value.type === 20) {
            var namedColor = COLORS[value.value.toUpperCase()];
            if (typeof namedColor !== "undefined") {
              return namedColor;
            }
          }
          return COLORS.TRANSPARENT;
        }
      };
      isTransparent = function(color2) {
        return (255 & color2) === 0;
      };
      asString = function(color2) {
        var alpha = 255 & color2;
        var blue = 255 & color2 >> 8;
        var green = 255 & color2 >> 16;
        var red = 255 & color2 >> 24;
        return alpha < 255 ? "rgba(" + red + "," + green + "," + blue + "," + alpha / 255 + ")" : "rgb(" + red + "," + green + "," + blue + ")";
      };
      pack = function(r, g, b, a2) {
        return (r << 24 | g << 16 | b << 8 | Math.round(a2 * 255) << 0) >>> 0;
      };
      getTokenColorValue = function(token, i) {
        if (token.type === 17) {
          return token.number;
        }
        if (token.type === 16) {
          var max = i === 3 ? 1 : 255;
          return i === 3 ? token.number / 100 * max : Math.round(token.number / 100 * max);
        }
        return 0;
      };
      rgb = function(_context, args) {
        var tokens = args.filter(nonFunctionArgSeparator);
        if (tokens.length === 3) {
          var _a = tokens.map(getTokenColorValue), r = _a[0], g = _a[1], b = _a[2];
          return pack(r, g, b, 1);
        }
        if (tokens.length === 4) {
          var _b = tokens.map(getTokenColorValue), r = _b[0], g = _b[1], b = _b[2], a2 = _b[3];
          return pack(r, g, b, a2);
        }
        return 0;
      };
      hsl = function(context, args) {
        var tokens = args.filter(nonFunctionArgSeparator);
        var hue = tokens[0], saturation = tokens[1], lightness = tokens[2], alpha = tokens[3];
        var h = (hue.type === 17 ? deg(hue.number) : angle.parse(context, hue)) / (Math.PI * 2);
        var s = isLengthPercentage(saturation) ? saturation.number / 100 : 0;
        var l = isLengthPercentage(lightness) ? lightness.number / 100 : 0;
        var a2 = typeof alpha !== "undefined" && isLengthPercentage(alpha) ? getAbsoluteValue(alpha, 1) : 1;
        if (s === 0) {
          return pack(l * 255, l * 255, l * 255, 1);
        }
        var t2 = l <= 0.5 ? l * (s + 1) : l + s - l * s;
        var t1 = l * 2 - t2;
        var r = hue2rgb(t1, t2, h + 1 / 3);
        var g = hue2rgb(t1, t2, h);
        var b = hue2rgb(t1, t2, h - 1 / 3);
        return pack(r * 255, g * 255, b * 255, a2);
      };
      SUPPORTED_COLOR_FUNCTIONS = {
        hsl,
        hsla: hsl,
        rgb,
        rgba: rgb
      };
      parseColor = function(context, value) {
        return color$1.parse(context, Parser.create(value).parseComponentValue());
      };
      COLORS = {
        ALICEBLUE: 4042850303,
        ANTIQUEWHITE: 4209760255,
        AQUA: 16777215,
        AQUAMARINE: 2147472639,
        AZURE: 4043309055,
        BEIGE: 4126530815,
        BISQUE: 4293182719,
        BLACK: 255,
        BLANCHEDALMOND: 4293643775,
        BLUE: 65535,
        BLUEVIOLET: 2318131967,
        BROWN: 2771004159,
        BURLYWOOD: 3736635391,
        CADETBLUE: 1604231423,
        CHARTREUSE: 2147418367,
        CHOCOLATE: 3530104575,
        CORAL: 4286533887,
        CORNFLOWERBLUE: 1687547391,
        CORNSILK: 4294499583,
        CRIMSON: 3692313855,
        CYAN: 16777215,
        DARKBLUE: 35839,
        DARKCYAN: 9145343,
        DARKGOLDENROD: 3095837695,
        DARKGRAY: 2846468607,
        DARKGREEN: 6553855,
        DARKGREY: 2846468607,
        DARKKHAKI: 3182914559,
        DARKMAGENTA: 2332068863,
        DARKOLIVEGREEN: 1433087999,
        DARKORANGE: 4287365375,
        DARKORCHID: 2570243327,
        DARKRED: 2332033279,
        DARKSALMON: 3918953215,
        DARKSEAGREEN: 2411499519,
        DARKSLATEBLUE: 1211993087,
        DARKSLATEGRAY: 793726975,
        DARKSLATEGREY: 793726975,
        DARKTURQUOISE: 13554175,
        DARKVIOLET: 2483082239,
        DEEPPINK: 4279538687,
        DEEPSKYBLUE: 12582911,
        DIMGRAY: 1768516095,
        DIMGREY: 1768516095,
        DODGERBLUE: 512819199,
        FIREBRICK: 2988581631,
        FLORALWHITE: 4294635775,
        FORESTGREEN: 579543807,
        FUCHSIA: 4278255615,
        GAINSBORO: 3705462015,
        GHOSTWHITE: 4177068031,
        GOLD: 4292280575,
        GOLDENROD: 3668254975,
        GRAY: 2155905279,
        GREEN: 8388863,
        GREENYELLOW: 2919182335,
        GREY: 2155905279,
        HONEYDEW: 4043305215,
        HOTPINK: 4285117695,
        INDIANRED: 3445382399,
        INDIGO: 1258324735,
        IVORY: 4294963455,
        KHAKI: 4041641215,
        LAVENDER: 3873897215,
        LAVENDERBLUSH: 4293981695,
        LAWNGREEN: 2096890111,
        LEMONCHIFFON: 4294626815,
        LIGHTBLUE: 2916673279,
        LIGHTCORAL: 4034953471,
        LIGHTCYAN: 3774873599,
        LIGHTGOLDENRODYELLOW: 4210742015,
        LIGHTGRAY: 3553874943,
        LIGHTGREEN: 2431553791,
        LIGHTGREY: 3553874943,
        LIGHTPINK: 4290167295,
        LIGHTSALMON: 4288707327,
        LIGHTSEAGREEN: 548580095,
        LIGHTSKYBLUE: 2278488831,
        LIGHTSLATEGRAY: 2005441023,
        LIGHTSLATEGREY: 2005441023,
        LIGHTSTEELBLUE: 2965692159,
        LIGHTYELLOW: 4294959359,
        LIME: 16711935,
        LIMEGREEN: 852308735,
        LINEN: 4210091775,
        MAGENTA: 4278255615,
        MAROON: 2147483903,
        MEDIUMAQUAMARINE: 1724754687,
        MEDIUMBLUE: 52735,
        MEDIUMORCHID: 3126187007,
        MEDIUMPURPLE: 2473647103,
        MEDIUMSEAGREEN: 1018393087,
        MEDIUMSLATEBLUE: 2070474495,
        MEDIUMSPRINGGREEN: 16423679,
        MEDIUMTURQUOISE: 1221709055,
        MEDIUMVIOLETRED: 3340076543,
        MIDNIGHTBLUE: 421097727,
        MINTCREAM: 4127193855,
        MISTYROSE: 4293190143,
        MOCCASIN: 4293178879,
        NAVAJOWHITE: 4292783615,
        NAVY: 33023,
        OLDLACE: 4260751103,
        OLIVE: 2155872511,
        OLIVEDRAB: 1804477439,
        ORANGE: 4289003775,
        ORANGERED: 4282712319,
        ORCHID: 3664828159,
        PALEGOLDENROD: 4008225535,
        PALEGREEN: 2566625535,
        PALETURQUOISE: 2951671551,
        PALEVIOLETRED: 3681588223,
        PAPAYAWHIP: 4293907967,
        PEACHPUFF: 4292524543,
        PERU: 3448061951,
        PINK: 4290825215,
        PLUM: 3718307327,
        POWDERBLUE: 2967529215,
        PURPLE: 2147516671,
        REBECCAPURPLE: 1714657791,
        RED: 4278190335,
        ROSYBROWN: 3163525119,
        ROYALBLUE: 1097458175,
        SADDLEBROWN: 2336560127,
        SALMON: 4202722047,
        SANDYBROWN: 4104413439,
        SEAGREEN: 780883967,
        SEASHELL: 4294307583,
        SIENNA: 2689740287,
        SILVER: 3233857791,
        SKYBLUE: 2278484991,
        SLATEBLUE: 1784335871,
        SLATEGRAY: 1887473919,
        SLATEGREY: 1887473919,
        SNOW: 4294638335,
        SPRINGGREEN: 16744447,
        STEELBLUE: 1182971135,
        TAN: 3535047935,
        TEAL: 8421631,
        THISTLE: 3636451583,
        TOMATO: 4284696575,
        TRANSPARENT: 0,
        TURQUOISE: 1088475391,
        VIOLET: 4001558271,
        WHEAT: 4125012991,
        WHITE: 4294967295,
        WHITESMOKE: 4126537215,
        YELLOW: 4294902015,
        YELLOWGREEN: 2597139199
      };
      backgroundClip = {
        name: "background-clip",
        initialValue: "border-box",
        prefix: false,
        type: 1,
        parse: function(_context, tokens) {
          return tokens.map(function(token) {
            if (isIdentToken(token)) {
              switch (token.value) {
                case "padding-box":
                  return 1;
                case "content-box":
                  return 2;
              }
            }
            return 0;
          });
        }
      };
      backgroundColor = {
        name: "background-color",
        initialValue: "transparent",
        prefix: false,
        type: 3,
        format: "color"
      };
      parseColorStop = function(context, args) {
        var color2 = color$1.parse(context, args[0]);
        var stop = args[1];
        return stop && isLengthPercentage(stop) ? { color: color2, stop } : { color: color2, stop: null };
      };
      processColorStops = function(stops, lineLength) {
        var first = stops[0];
        var last = stops[stops.length - 1];
        if (first.stop === null) {
          first.stop = ZERO_LENGTH;
        }
        if (last.stop === null) {
          last.stop = HUNDRED_PERCENT;
        }
        var processStops = [];
        var previous = 0;
        for (var i = 0; i < stops.length; i++) {
          var stop_1 = stops[i].stop;
          if (stop_1 !== null) {
            var absoluteValue = getAbsoluteValue(stop_1, lineLength);
            if (absoluteValue > previous) {
              processStops.push(absoluteValue);
            } else {
              processStops.push(previous);
            }
            previous = absoluteValue;
          } else {
            processStops.push(null);
          }
        }
        var gapBegin = null;
        for (var i = 0; i < processStops.length; i++) {
          var stop_2 = processStops[i];
          if (stop_2 === null) {
            if (gapBegin === null) {
              gapBegin = i;
            }
          } else if (gapBegin !== null) {
            var gapLength = i - gapBegin;
            var beforeGap = processStops[gapBegin - 1];
            var gapValue = (stop_2 - beforeGap) / (gapLength + 1);
            for (var g = 1; g <= gapLength; g++) {
              processStops[gapBegin + g - 1] = gapValue * g;
            }
            gapBegin = null;
          }
        }
        return stops.map(function(_a, i2) {
          var color2 = _a.color;
          return { color: color2, stop: Math.max(Math.min(1, processStops[i2] / lineLength), 0) };
        });
      };
      getAngleFromCorner = function(corner, width, height) {
        var centerX = width / 2;
        var centerY = height / 2;
        var x = getAbsoluteValue(corner[0], width) - centerX;
        var y = centerY - getAbsoluteValue(corner[1], height);
        return (Math.atan2(y, x) + Math.PI * 2) % (Math.PI * 2);
      };
      calculateGradientDirection = function(angle2, width, height) {
        var radian = typeof angle2 === "number" ? angle2 : getAngleFromCorner(angle2, width, height);
        var lineLength = Math.abs(width * Math.sin(radian)) + Math.abs(height * Math.cos(radian));
        var halfWidth = width / 2;
        var halfHeight = height / 2;
        var halfLineLength = lineLength / 2;
        var yDiff = Math.sin(radian - Math.PI / 2) * halfLineLength;
        var xDiff = Math.cos(radian - Math.PI / 2) * halfLineLength;
        return [lineLength, halfWidth - xDiff, halfWidth + xDiff, halfHeight - yDiff, halfHeight + yDiff];
      };
      distance = function(a2, b) {
        return Math.sqrt(a2 * a2 + b * b);
      };
      findCorner = function(width, height, x, y, closest) {
        var corners = [
          [0, 0],
          [0, height],
          [width, 0],
          [width, height]
        ];
        return corners.reduce(function(stat, corner) {
          var cx = corner[0], cy = corner[1];
          var d = distance(x - cx, y - cy);
          if (closest ? d < stat.optimumDistance : d > stat.optimumDistance) {
            return {
              optimumCorner: corner,
              optimumDistance: d
            };
          }
          return stat;
        }, {
          optimumDistance: closest ? Infinity : -Infinity,
          optimumCorner: null
        }).optimumCorner;
      };
      calculateRadius = function(gradient, x, y, width, height) {
        var rx = 0;
        var ry = 0;
        switch (gradient.size) {
          case 0:
            if (gradient.shape === 0) {
              rx = ry = Math.min(Math.abs(x), Math.abs(x - width), Math.abs(y), Math.abs(y - height));
            } else if (gradient.shape === 1) {
              rx = Math.min(Math.abs(x), Math.abs(x - width));
              ry = Math.min(Math.abs(y), Math.abs(y - height));
            }
            break;
          case 2:
            if (gradient.shape === 0) {
              rx = ry = Math.min(distance(x, y), distance(x, y - height), distance(x - width, y), distance(x - width, y - height));
            } else if (gradient.shape === 1) {
              var c = Math.min(Math.abs(y), Math.abs(y - height)) / Math.min(Math.abs(x), Math.abs(x - width));
              var _a = findCorner(width, height, x, y, true), cx = _a[0], cy = _a[1];
              rx = distance(cx - x, (cy - y) / c);
              ry = c * rx;
            }
            break;
          case 1:
            if (gradient.shape === 0) {
              rx = ry = Math.max(Math.abs(x), Math.abs(x - width), Math.abs(y), Math.abs(y - height));
            } else if (gradient.shape === 1) {
              rx = Math.max(Math.abs(x), Math.abs(x - width));
              ry = Math.max(Math.abs(y), Math.abs(y - height));
            }
            break;
          case 3:
            if (gradient.shape === 0) {
              rx = ry = Math.max(distance(x, y), distance(x, y - height), distance(x - width, y), distance(x - width, y - height));
            } else if (gradient.shape === 1) {
              var c = Math.max(Math.abs(y), Math.abs(y - height)) / Math.max(Math.abs(x), Math.abs(x - width));
              var _b = findCorner(width, height, x, y, false), cx = _b[0], cy = _b[1];
              rx = distance(cx - x, (cy - y) / c);
              ry = c * rx;
            }
            break;
        }
        if (Array.isArray(gradient.size)) {
          rx = getAbsoluteValue(gradient.size[0], width);
          ry = gradient.size.length === 2 ? getAbsoluteValue(gradient.size[1], height) : rx;
        }
        return [rx, ry];
      };
      linearGradient = function(context, tokens) {
        var angle$1 = deg(180);
        var stops = [];
        parseFunctionArgs(tokens).forEach(function(arg, i) {
          if (i === 0) {
            var firstToken = arg[0];
            if (firstToken.type === 20 && firstToken.value === "to") {
              angle$1 = parseNamedSide(arg);
              return;
            } else if (isAngle(firstToken)) {
              angle$1 = angle.parse(context, firstToken);
              return;
            }
          }
          var colorStop = parseColorStop(context, arg);
          stops.push(colorStop);
        });
        return {
          angle: angle$1,
          stops,
          type: 1
          /* LINEAR_GRADIENT */
        };
      };
      prefixLinearGradient = function(context, tokens) {
        var angle$1 = deg(180);
        var stops = [];
        parseFunctionArgs(tokens).forEach(function(arg, i) {
          if (i === 0) {
            var firstToken = arg[0];
            if (firstToken.type === 20 && ["top", "left", "right", "bottom"].indexOf(firstToken.value) !== -1) {
              angle$1 = parseNamedSide(arg);
              return;
            } else if (isAngle(firstToken)) {
              angle$1 = (angle.parse(context, firstToken) + deg(270)) % deg(360);
              return;
            }
          }
          var colorStop = parseColorStop(context, arg);
          stops.push(colorStop);
        });
        return {
          angle: angle$1,
          stops,
          type: 1
          /* LINEAR_GRADIENT */
        };
      };
      webkitGradient = function(context, tokens) {
        var angle2 = deg(180);
        var stops = [];
        var type = 1;
        var shape = 0;
        var size = 3;
        var position2 = [];
        parseFunctionArgs(tokens).forEach(function(arg, i) {
          var firstToken = arg[0];
          if (i === 0) {
            if (isIdentToken(firstToken) && firstToken.value === "linear") {
              type = 1;
              return;
            } else if (isIdentToken(firstToken) && firstToken.value === "radial") {
              type = 2;
              return;
            }
          }
          if (firstToken.type === 18) {
            if (firstToken.name === "from") {
              var color2 = color$1.parse(context, firstToken.values[0]);
              stops.push({ stop: ZERO_LENGTH, color: color2 });
            } else if (firstToken.name === "to") {
              var color2 = color$1.parse(context, firstToken.values[0]);
              stops.push({ stop: HUNDRED_PERCENT, color: color2 });
            } else if (firstToken.name === "color-stop") {
              var values = firstToken.values.filter(nonFunctionArgSeparator);
              if (values.length === 2) {
                var color2 = color$1.parse(context, values[1]);
                var stop_1 = values[0];
                if (isNumberToken(stop_1)) {
                  stops.push({
                    stop: { type: 16, number: stop_1.number * 100, flags: stop_1.flags },
                    color: color2
                  });
                }
              }
            }
          }
        });
        return type === 1 ? {
          angle: (angle2 + deg(180)) % deg(360),
          stops,
          type
        } : { size, shape, stops, position: position2, type };
      };
      CLOSEST_SIDE = "closest-side";
      FARTHEST_SIDE = "farthest-side";
      CLOSEST_CORNER = "closest-corner";
      FARTHEST_CORNER = "farthest-corner";
      CIRCLE = "circle";
      ELLIPSE = "ellipse";
      COVER = "cover";
      CONTAIN = "contain";
      radialGradient = function(context, tokens) {
        var shape = 0;
        var size = 3;
        var stops = [];
        var position2 = [];
        parseFunctionArgs(tokens).forEach(function(arg, i) {
          var isColorStop = true;
          if (i === 0) {
            var isAtPosition_1 = false;
            isColorStop = arg.reduce(function(acc, token) {
              if (isAtPosition_1) {
                if (isIdentToken(token)) {
                  switch (token.value) {
                    case "center":
                      position2.push(FIFTY_PERCENT);
                      return acc;
                    case "top":
                    case "left":
                      position2.push(ZERO_LENGTH);
                      return acc;
                    case "right":
                    case "bottom":
                      position2.push(HUNDRED_PERCENT);
                      return acc;
                  }
                } else if (isLengthPercentage(token) || isLength(token)) {
                  position2.push(token);
                }
              } else if (isIdentToken(token)) {
                switch (token.value) {
                  case CIRCLE:
                    shape = 0;
                    return false;
                  case ELLIPSE:
                    shape = 1;
                    return false;
                  case "at":
                    isAtPosition_1 = true;
                    return false;
                  case CLOSEST_SIDE:
                    size = 0;
                    return false;
                  case COVER:
                  case FARTHEST_SIDE:
                    size = 1;
                    return false;
                  case CONTAIN:
                  case CLOSEST_CORNER:
                    size = 2;
                    return false;
                  case FARTHEST_CORNER:
                    size = 3;
                    return false;
                }
              } else if (isLength(token) || isLengthPercentage(token)) {
                if (!Array.isArray(size)) {
                  size = [];
                }
                size.push(token);
                return false;
              }
              return acc;
            }, isColorStop);
          }
          if (isColorStop) {
            var colorStop = parseColorStop(context, arg);
            stops.push(colorStop);
          }
        });
        return {
          size,
          shape,
          stops,
          position: position2,
          type: 2
          /* RADIAL_GRADIENT */
        };
      };
      prefixRadialGradient = function(context, tokens) {
        var shape = 0;
        var size = 3;
        var stops = [];
        var position2 = [];
        parseFunctionArgs(tokens).forEach(function(arg, i) {
          var isColorStop = true;
          if (i === 0) {
            isColorStop = arg.reduce(function(acc, token) {
              if (isIdentToken(token)) {
                switch (token.value) {
                  case "center":
                    position2.push(FIFTY_PERCENT);
                    return false;
                  case "top":
                  case "left":
                    position2.push(ZERO_LENGTH);
                    return false;
                  case "right":
                  case "bottom":
                    position2.push(HUNDRED_PERCENT);
                    return false;
                }
              } else if (isLengthPercentage(token) || isLength(token)) {
                position2.push(token);
                return false;
              }
              return acc;
            }, isColorStop);
          } else if (i === 1) {
            isColorStop = arg.reduce(function(acc, token) {
              if (isIdentToken(token)) {
                switch (token.value) {
                  case CIRCLE:
                    shape = 0;
                    return false;
                  case ELLIPSE:
                    shape = 1;
                    return false;
                  case CONTAIN:
                  case CLOSEST_SIDE:
                    size = 0;
                    return false;
                  case FARTHEST_SIDE:
                    size = 1;
                    return false;
                  case CLOSEST_CORNER:
                    size = 2;
                    return false;
                  case COVER:
                  case FARTHEST_CORNER:
                    size = 3;
                    return false;
                }
              } else if (isLength(token) || isLengthPercentage(token)) {
                if (!Array.isArray(size)) {
                  size = [];
                }
                size.push(token);
                return false;
              }
              return acc;
            }, isColorStop);
          }
          if (isColorStop) {
            var colorStop = parseColorStop(context, arg);
            stops.push(colorStop);
          }
        });
        return {
          size,
          shape,
          stops,
          position: position2,
          type: 2
          /* RADIAL_GRADIENT */
        };
      };
      isLinearGradient = function(background) {
        return background.type === 1;
      };
      isRadialGradient = function(background) {
        return background.type === 2;
      };
      image = {
        name: "image",
        parse: function(context, value) {
          if (value.type === 22) {
            var image_1 = {
              url: value.value,
              type: 0
              /* URL */
            };
            context.cache.addImage(value.value);
            return image_1;
          }
          if (value.type === 18) {
            var imageFunction = SUPPORTED_IMAGE_FUNCTIONS[value.name];
            if (typeof imageFunction === "undefined") {
              throw new Error('Attempting to parse an unsupported image function "' + value.name + '"');
            }
            return imageFunction(context, value.values);
          }
          throw new Error("Unsupported image type " + value.type);
        }
      };
      SUPPORTED_IMAGE_FUNCTIONS = {
        "linear-gradient": linearGradient,
        "-moz-linear-gradient": prefixLinearGradient,
        "-ms-linear-gradient": prefixLinearGradient,
        "-o-linear-gradient": prefixLinearGradient,
        "-webkit-linear-gradient": prefixLinearGradient,
        "radial-gradient": radialGradient,
        "-moz-radial-gradient": prefixRadialGradient,
        "-ms-radial-gradient": prefixRadialGradient,
        "-o-radial-gradient": prefixRadialGradient,
        "-webkit-radial-gradient": prefixRadialGradient,
        "-webkit-gradient": webkitGradient
      };
      backgroundImage = {
        name: "background-image",
        initialValue: "none",
        type: 1,
        prefix: false,
        parse: function(context, tokens) {
          if (tokens.length === 0) {
            return [];
          }
          var first = tokens[0];
          if (first.type === 20 && first.value === "none") {
            return [];
          }
          return tokens.filter(function(value) {
            return nonFunctionArgSeparator(value) && isSupportedImage(value);
          }).map(function(value) {
            return image.parse(context, value);
          });
        }
      };
      backgroundOrigin = {
        name: "background-origin",
        initialValue: "border-box",
        prefix: false,
        type: 1,
        parse: function(_context, tokens) {
          return tokens.map(function(token) {
            if (isIdentToken(token)) {
              switch (token.value) {
                case "padding-box":
                  return 1;
                case "content-box":
                  return 2;
              }
            }
            return 0;
          });
        }
      };
      backgroundPosition = {
        name: "background-position",
        initialValue: "0% 0%",
        type: 1,
        prefix: false,
        parse: function(_context, tokens) {
          return parseFunctionArgs(tokens).map(function(values) {
            return values.filter(isLengthPercentage);
          }).map(parseLengthPercentageTuple);
        }
      };
      backgroundRepeat = {
        name: "background-repeat",
        initialValue: "repeat",
        prefix: false,
        type: 1,
        parse: function(_context, tokens) {
          return parseFunctionArgs(tokens).map(function(values) {
            return values.filter(isIdentToken).map(function(token) {
              return token.value;
            }).join(" ");
          }).map(parseBackgroundRepeat);
        }
      };
      parseBackgroundRepeat = function(value) {
        switch (value) {
          case "no-repeat":
            return 1;
          case "repeat-x":
          case "repeat no-repeat":
            return 2;
          case "repeat-y":
          case "no-repeat repeat":
            return 3;
          case "repeat":
          default:
            return 0;
        }
      };
      (function(BACKGROUND_SIZE2) {
        BACKGROUND_SIZE2["AUTO"] = "auto";
        BACKGROUND_SIZE2["CONTAIN"] = "contain";
        BACKGROUND_SIZE2["COVER"] = "cover";
      })(BACKGROUND_SIZE || (BACKGROUND_SIZE = {}));
      backgroundSize = {
        name: "background-size",
        initialValue: "0",
        prefix: false,
        type: 1,
        parse: function(_context, tokens) {
          return parseFunctionArgs(tokens).map(function(values) {
            return values.filter(isBackgroundSizeInfoToken);
          });
        }
      };
      isBackgroundSizeInfoToken = function(value) {
        return isIdentToken(value) || isLengthPercentage(value);
      };
      borderColorForSide = function(side) {
        return {
          name: "border-" + side + "-color",
          initialValue: "transparent",
          prefix: false,
          type: 3,
          format: "color"
        };
      };
      borderTopColor = borderColorForSide("top");
      borderRightColor = borderColorForSide("right");
      borderBottomColor = borderColorForSide("bottom");
      borderLeftColor = borderColorForSide("left");
      borderRadiusForSide = function(side) {
        return {
          name: "border-radius-" + side,
          initialValue: "0 0",
          prefix: false,
          type: 1,
          parse: function(_context, tokens) {
            return parseLengthPercentageTuple(tokens.filter(isLengthPercentage));
          }
        };
      };
      borderTopLeftRadius = borderRadiusForSide("top-left");
      borderTopRightRadius = borderRadiusForSide("top-right");
      borderBottomRightRadius = borderRadiusForSide("bottom-right");
      borderBottomLeftRadius = borderRadiusForSide("bottom-left");
      borderStyleForSide = function(side) {
        return {
          name: "border-" + side + "-style",
          initialValue: "solid",
          prefix: false,
          type: 2,
          parse: function(_context, style) {
            switch (style) {
              case "none":
                return 0;
              case "dashed":
                return 2;
              case "dotted":
                return 3;
              case "double":
                return 4;
            }
            return 1;
          }
        };
      };
      borderTopStyle = borderStyleForSide("top");
      borderRightStyle = borderStyleForSide("right");
      borderBottomStyle = borderStyleForSide("bottom");
      borderLeftStyle = borderStyleForSide("left");
      borderWidthForSide = function(side) {
        return {
          name: "border-" + side + "-width",
          initialValue: "0",
          type: 0,
          prefix: false,
          parse: function(_context, token) {
            if (isDimensionToken(token)) {
              return token.number;
            }
            return 0;
          }
        };
      };
      borderTopWidth = borderWidthForSide("top");
      borderRightWidth = borderWidthForSide("right");
      borderBottomWidth = borderWidthForSide("bottom");
      borderLeftWidth = borderWidthForSide("left");
      color = {
        name: "color",
        initialValue: "transparent",
        prefix: false,
        type: 3,
        format: "color"
      };
      direction = {
        name: "direction",
        initialValue: "ltr",
        prefix: false,
        type: 2,
        parse: function(_context, direction2) {
          switch (direction2) {
            case "rtl":
              return 1;
            case "ltr":
            default:
              return 0;
          }
        }
      };
      display = {
        name: "display",
        initialValue: "inline-block",
        prefix: false,
        type: 1,
        parse: function(_context, tokens) {
          return tokens.filter(isIdentToken).reduce(
            function(bit, token) {
              return bit | parseDisplayValue(token.value);
            },
            0
            /* NONE */
          );
        }
      };
      parseDisplayValue = function(display2) {
        switch (display2) {
          case "block":
          case "-webkit-box":
            return 2;
          case "inline":
            return 4;
          case "run-in":
            return 8;
          case "flow":
            return 16;
          case "flow-root":
            return 32;
          case "table":
            return 64;
          case "flex":
          case "-webkit-flex":
            return 128;
          case "grid":
          case "-ms-grid":
            return 256;
          case "ruby":
            return 512;
          case "subgrid":
            return 1024;
          case "list-item":
            return 2048;
          case "table-row-group":
            return 4096;
          case "table-header-group":
            return 8192;
          case "table-footer-group":
            return 16384;
          case "table-row":
            return 32768;
          case "table-cell":
            return 65536;
          case "table-column-group":
            return 131072;
          case "table-column":
            return 262144;
          case "table-caption":
            return 524288;
          case "ruby-base":
            return 1048576;
          case "ruby-text":
            return 2097152;
          case "ruby-base-container":
            return 4194304;
          case "ruby-text-container":
            return 8388608;
          case "contents":
            return 16777216;
          case "inline-block":
            return 33554432;
          case "inline-list-item":
            return 67108864;
          case "inline-table":
            return 134217728;
          case "inline-flex":
            return 268435456;
          case "inline-grid":
            return 536870912;
        }
        return 0;
      };
      float = {
        name: "float",
        initialValue: "none",
        prefix: false,
        type: 2,
        parse: function(_context, float2) {
          switch (float2) {
            case "left":
              return 1;
            case "right":
              return 2;
            case "inline-start":
              return 3;
            case "inline-end":
              return 4;
          }
          return 0;
        }
      };
      letterSpacing = {
        name: "letter-spacing",
        initialValue: "0",
        prefix: false,
        type: 0,
        parse: function(_context, token) {
          if (token.type === 20 && token.value === "normal") {
            return 0;
          }
          if (token.type === 17) {
            return token.number;
          }
          if (token.type === 15) {
            return token.number;
          }
          return 0;
        }
      };
      (function(LINE_BREAK2) {
        LINE_BREAK2["NORMAL"] = "normal";
        LINE_BREAK2["STRICT"] = "strict";
      })(LINE_BREAK || (LINE_BREAK = {}));
      lineBreak = {
        name: "line-break",
        initialValue: "normal",
        prefix: false,
        type: 2,
        parse: function(_context, lineBreak2) {
          switch (lineBreak2) {
            case "strict":
              return LINE_BREAK.STRICT;
            case "normal":
            default:
              return LINE_BREAK.NORMAL;
          }
        }
      };
      lineHeight = {
        name: "line-height",
        initialValue: "normal",
        prefix: false,
        type: 4
        /* TOKEN_VALUE */
      };
      computeLineHeight = function(token, fontSize2) {
        if (isIdentToken(token) && token.value === "normal") {
          return 1.2 * fontSize2;
        } else if (token.type === 17) {
          return fontSize2 * token.number;
        } else if (isLengthPercentage(token)) {
          return getAbsoluteValue(token, fontSize2);
        }
        return fontSize2;
      };
      listStyleImage = {
        name: "list-style-image",
        initialValue: "none",
        type: 0,
        prefix: false,
        parse: function(context, token) {
          if (token.type === 20 && token.value === "none") {
            return null;
          }
          return image.parse(context, token);
        }
      };
      listStylePosition = {
        name: "list-style-position",
        initialValue: "outside",
        prefix: false,
        type: 2,
        parse: function(_context, position2) {
          switch (position2) {
            case "inside":
              return 0;
            case "outside":
            default:
              return 1;
          }
        }
      };
      listStyleType = {
        name: "list-style-type",
        initialValue: "none",
        prefix: false,
        type: 2,
        parse: function(_context, type) {
          switch (type) {
            case "disc":
              return 0;
            case "circle":
              return 1;
            case "square":
              return 2;
            case "decimal":
              return 3;
            case "cjk-decimal":
              return 4;
            case "decimal-leading-zero":
              return 5;
            case "lower-roman":
              return 6;
            case "upper-roman":
              return 7;
            case "lower-greek":
              return 8;
            case "lower-alpha":
              return 9;
            case "upper-alpha":
              return 10;
            case "arabic-indic":
              return 11;
            case "armenian":
              return 12;
            case "bengali":
              return 13;
            case "cambodian":
              return 14;
            case "cjk-earthly-branch":
              return 15;
            case "cjk-heavenly-stem":
              return 16;
            case "cjk-ideographic":
              return 17;
            case "devanagari":
              return 18;
            case "ethiopic-numeric":
              return 19;
            case "georgian":
              return 20;
            case "gujarati":
              return 21;
            case "gurmukhi":
              return 22;
            case "hebrew":
              return 22;
            case "hiragana":
              return 23;
            case "hiragana-iroha":
              return 24;
            case "japanese-formal":
              return 25;
            case "japanese-informal":
              return 26;
            case "kannada":
              return 27;
            case "katakana":
              return 28;
            case "katakana-iroha":
              return 29;
            case "khmer":
              return 30;
            case "korean-hangul-formal":
              return 31;
            case "korean-hanja-formal":
              return 32;
            case "korean-hanja-informal":
              return 33;
            case "lao":
              return 34;
            case "lower-armenian":
              return 35;
            case "malayalam":
              return 36;
            case "mongolian":
              return 37;
            case "myanmar":
              return 38;
            case "oriya":
              return 39;
            case "persian":
              return 40;
            case "simp-chinese-formal":
              return 41;
            case "simp-chinese-informal":
              return 42;
            case "tamil":
              return 43;
            case "telugu":
              return 44;
            case "thai":
              return 45;
            case "tibetan":
              return 46;
            case "trad-chinese-formal":
              return 47;
            case "trad-chinese-informal":
              return 48;
            case "upper-armenian":
              return 49;
            case "disclosure-open":
              return 50;
            case "disclosure-closed":
              return 51;
            case "none":
            default:
              return -1;
          }
        }
      };
      marginForSide = function(side) {
        return {
          name: "margin-" + side,
          initialValue: "0",
          prefix: false,
          type: 4
          /* TOKEN_VALUE */
        };
      };
      marginTop = marginForSide("top");
      marginRight = marginForSide("right");
      marginBottom = marginForSide("bottom");
      marginLeft = marginForSide("left");
      overflow = {
        name: "overflow",
        initialValue: "visible",
        prefix: false,
        type: 1,
        parse: function(_context, tokens) {
          return tokens.filter(isIdentToken).map(function(overflow2) {
            switch (overflow2.value) {
              case "hidden":
                return 1;
              case "scroll":
                return 2;
              case "clip":
                return 3;
              case "auto":
                return 4;
              case "visible":
              default:
                return 0;
            }
          });
        }
      };
      overflowWrap = {
        name: "overflow-wrap",
        initialValue: "normal",
        prefix: false,
        type: 2,
        parse: function(_context, overflow2) {
          switch (overflow2) {
            case "break-word":
              return "break-word";
            case "normal":
            default:
              return "normal";
          }
        }
      };
      paddingForSide = function(side) {
        return {
          name: "padding-" + side,
          initialValue: "0",
          prefix: false,
          type: 3,
          format: "length-percentage"
        };
      };
      paddingTop = paddingForSide("top");
      paddingRight = paddingForSide("right");
      paddingBottom = paddingForSide("bottom");
      paddingLeft = paddingForSide("left");
      textAlign = {
        name: "text-align",
        initialValue: "left",
        prefix: false,
        type: 2,
        parse: function(_context, textAlign2) {
          switch (textAlign2) {
            case "right":
              return 2;
            case "center":
            case "justify":
              return 1;
            case "left":
            default:
              return 0;
          }
        }
      };
      position = {
        name: "position",
        initialValue: "static",
        prefix: false,
        type: 2,
        parse: function(_context, position2) {
          switch (position2) {
            case "relative":
              return 1;
            case "absolute":
              return 2;
            case "fixed":
              return 3;
            case "sticky":
              return 4;
          }
          return 0;
        }
      };
      textShadow = {
        name: "text-shadow",
        initialValue: "none",
        type: 1,
        prefix: false,
        parse: function(context, tokens) {
          if (tokens.length === 1 && isIdentWithValue(tokens[0], "none")) {
            return [];
          }
          return parseFunctionArgs(tokens).map(function(values) {
            var shadow = {
              color: COLORS.TRANSPARENT,
              offsetX: ZERO_LENGTH,
              offsetY: ZERO_LENGTH,
              blur: ZERO_LENGTH
            };
            var c = 0;
            for (var i = 0; i < values.length; i++) {
              var token = values[i];
              if (isLength(token)) {
                if (c === 0) {
                  shadow.offsetX = token;
                } else if (c === 1) {
                  shadow.offsetY = token;
                } else {
                  shadow.blur = token;
                }
                c++;
              } else {
                shadow.color = color$1.parse(context, token);
              }
            }
            return shadow;
          });
        }
      };
      textTransform = {
        name: "text-transform",
        initialValue: "none",
        prefix: false,
        type: 2,
        parse: function(_context, textTransform2) {
          switch (textTransform2) {
            case "uppercase":
              return 2;
            case "lowercase":
              return 1;
            case "capitalize":
              return 3;
          }
          return 0;
        }
      };
      transform$1 = {
        name: "transform",
        initialValue: "none",
        prefix: true,
        type: 0,
        parse: function(_context, token) {
          if (token.type === 20 && token.value === "none") {
            return null;
          }
          if (token.type === 18) {
            var transformFunction = SUPPORTED_TRANSFORM_FUNCTIONS[token.name];
            if (typeof transformFunction === "undefined") {
              throw new Error('Attempting to parse an unsupported transform function "' + token.name + '"');
            }
            return transformFunction(token.values);
          }
          return null;
        }
      };
      matrix = function(args) {
        var values = args.filter(function(arg) {
          return arg.type === 17;
        }).map(function(arg) {
          return arg.number;
        });
        return values.length === 6 ? values : null;
      };
      matrix3d = function(args) {
        var values = args.filter(function(arg) {
          return arg.type === 17;
        }).map(function(arg) {
          return arg.number;
        });
        var a1 = values[0], b1 = values[1];
        values[2];
        values[3];
        var a2 = values[4], b2 = values[5];
        values[6];
        values[7];
        values[8];
        values[9];
        values[10];
        values[11];
        var a4 = values[12], b4 = values[13];
        values[14];
        values[15];
        return values.length === 16 ? [a1, b1, a2, b2, a4, b4] : null;
      };
      SUPPORTED_TRANSFORM_FUNCTIONS = {
        matrix,
        matrix3d
      };
      DEFAULT_VALUE = {
        type: 16,
        number: 50,
        flags: FLAG_INTEGER
      };
      DEFAULT = [DEFAULT_VALUE, DEFAULT_VALUE];
      transformOrigin = {
        name: "transform-origin",
        initialValue: "50% 50%",
        prefix: true,
        type: 1,
        parse: function(_context, tokens) {
          var origins = tokens.filter(isLengthPercentage);
          if (origins.length !== 2) {
            return DEFAULT;
          }
          return [origins[0], origins[1]];
        }
      };
      visibility = {
        name: "visible",
        initialValue: "none",
        prefix: false,
        type: 2,
        parse: function(_context, visibility2) {
          switch (visibility2) {
            case "hidden":
              return 1;
            case "collapse":
              return 2;
            case "visible":
            default:
              return 0;
          }
        }
      };
      (function(WORD_BREAK2) {
        WORD_BREAK2["NORMAL"] = "normal";
        WORD_BREAK2["BREAK_ALL"] = "break-all";
        WORD_BREAK2["KEEP_ALL"] = "keep-all";
      })(WORD_BREAK || (WORD_BREAK = {}));
      wordBreak = {
        name: "word-break",
        initialValue: "normal",
        prefix: false,
        type: 2,
        parse: function(_context, wordBreak2) {
          switch (wordBreak2) {
            case "break-all":
              return WORD_BREAK.BREAK_ALL;
            case "keep-all":
              return WORD_BREAK.KEEP_ALL;
            case "normal":
            default:
              return WORD_BREAK.NORMAL;
          }
        }
      };
      zIndex = {
        name: "z-index",
        initialValue: "auto",
        prefix: false,
        type: 0,
        parse: function(_context, token) {
          if (token.type === 20) {
            return { auto: true, order: 0 };
          }
          if (isNumberToken(token)) {
            return { auto: false, order: token.number };
          }
          throw new Error("Invalid z-index number parsed");
        }
      };
      time = {
        name: "time",
        parse: function(_context, value) {
          if (value.type === 15) {
            switch (value.unit.toLowerCase()) {
              case "s":
                return 1e3 * value.number;
              case "ms":
                return value.number;
            }
          }
          throw new Error("Unsupported time type");
        }
      };
      opacity = {
        name: "opacity",
        initialValue: "1",
        type: 0,
        prefix: false,
        parse: function(_context, token) {
          if (isNumberToken(token)) {
            return token.number;
          }
          return 1;
        }
      };
      textDecorationColor = {
        name: "text-decoration-color",
        initialValue: "transparent",
        prefix: false,
        type: 3,
        format: "color"
      };
      textDecorationLine = {
        name: "text-decoration-line",
        initialValue: "none",
        prefix: false,
        type: 1,
        parse: function(_context, tokens) {
          return tokens.filter(isIdentToken).map(function(token) {
            switch (token.value) {
              case "underline":
                return 1;
              case "overline":
                return 2;
              case "line-through":
                return 3;
              case "none":
                return 4;
            }
            return 0;
          }).filter(function(line) {
            return line !== 0;
          });
        }
      };
      fontFamily = {
        name: "font-family",
        initialValue: "",
        prefix: false,
        type: 1,
        parse: function(_context, tokens) {
          var accumulator = [];
          var results = [];
          tokens.forEach(function(token) {
            switch (token.type) {
              case 20:
              case 0:
                accumulator.push(token.value);
                break;
              case 17:
                accumulator.push(token.number.toString());
                break;
              case 4:
                results.push(accumulator.join(" "));
                accumulator.length = 0;
                break;
            }
          });
          if (accumulator.length) {
            results.push(accumulator.join(" "));
          }
          return results.map(function(result) {
            return result.indexOf(" ") === -1 ? result : "'" + result + "'";
          });
        }
      };
      fontSize = {
        name: "font-size",
        initialValue: "0",
        prefix: false,
        type: 3,
        format: "length"
      };
      fontWeight = {
        name: "font-weight",
        initialValue: "normal",
        type: 0,
        prefix: false,
        parse: function(_context, token) {
          if (isNumberToken(token)) {
            return token.number;
          }
          if (isIdentToken(token)) {
            switch (token.value) {
              case "bold":
                return 700;
              case "normal":
              default:
                return 400;
            }
          }
          return 400;
        }
      };
      fontVariant = {
        name: "font-variant",
        initialValue: "none",
        type: 1,
        prefix: false,
        parse: function(_context, tokens) {
          return tokens.filter(isIdentToken).map(function(token) {
            return token.value;
          });
        }
      };
      fontStyle = {
        name: "font-style",
        initialValue: "normal",
        prefix: false,
        type: 2,
        parse: function(_context, overflow2) {
          switch (overflow2) {
            case "oblique":
              return "oblique";
            case "italic":
              return "italic";
            case "normal":
            default:
              return "normal";
          }
        }
      };
      contains = function(bit, value) {
        return (bit & value) !== 0;
      };
      content = {
        name: "content",
        initialValue: "none",
        type: 1,
        prefix: false,
        parse: function(_context, tokens) {
          if (tokens.length === 0) {
            return [];
          }
          var first = tokens[0];
          if (first.type === 20 && first.value === "none") {
            return [];
          }
          return tokens;
        }
      };
      counterIncrement = {
        name: "counter-increment",
        initialValue: "none",
        prefix: true,
        type: 1,
        parse: function(_context, tokens) {
          if (tokens.length === 0) {
            return null;
          }
          var first = tokens[0];
          if (first.type === 20 && first.value === "none") {
            return null;
          }
          var increments = [];
          var filtered = tokens.filter(nonWhiteSpace);
          for (var i = 0; i < filtered.length; i++) {
            var counter = filtered[i];
            var next = filtered[i + 1];
            if (counter.type === 20) {
              var increment = next && isNumberToken(next) ? next.number : 1;
              increments.push({ counter: counter.value, increment });
            }
          }
          return increments;
        }
      };
      counterReset = {
        name: "counter-reset",
        initialValue: "none",
        prefix: true,
        type: 1,
        parse: function(_context, tokens) {
          if (tokens.length === 0) {
            return [];
          }
          var resets = [];
          var filtered = tokens.filter(nonWhiteSpace);
          for (var i = 0; i < filtered.length; i++) {
            var counter = filtered[i];
            var next = filtered[i + 1];
            if (isIdentToken(counter) && counter.value !== "none") {
              var reset = next && isNumberToken(next) ? next.number : 0;
              resets.push({ counter: counter.value, reset });
            }
          }
          return resets;
        }
      };
      duration = {
        name: "duration",
        initialValue: "0s",
        prefix: false,
        type: 1,
        parse: function(context, tokens) {
          return tokens.filter(isDimensionToken).map(function(token) {
            return time.parse(context, token);
          });
        }
      };
      quotes = {
        name: "quotes",
        initialValue: "none",
        prefix: true,
        type: 1,
        parse: function(_context, tokens) {
          if (tokens.length === 0) {
            return null;
          }
          var first = tokens[0];
          if (first.type === 20 && first.value === "none") {
            return null;
          }
          var quotes2 = [];
          var filtered = tokens.filter(isStringToken);
          if (filtered.length % 2 !== 0) {
            return null;
          }
          for (var i = 0; i < filtered.length; i += 2) {
            var open_1 = filtered[i].value;
            var close_1 = filtered[i + 1].value;
            quotes2.push({ open: open_1, close: close_1 });
          }
          return quotes2;
        }
      };
      getQuote = function(quotes2, depth, open) {
        if (!quotes2) {
          return "";
        }
        var quote = quotes2[Math.min(depth, quotes2.length - 1)];
        if (!quote) {
          return "";
        }
        return open ? quote.open : quote.close;
      };
      boxShadow = {
        name: "box-shadow",
        initialValue: "none",
        type: 1,
        prefix: false,
        parse: function(context, tokens) {
          if (tokens.length === 1 && isIdentWithValue(tokens[0], "none")) {
            return [];
          }
          return parseFunctionArgs(tokens).map(function(values) {
            var shadow = {
              color: 255,
              offsetX: ZERO_LENGTH,
              offsetY: ZERO_LENGTH,
              blur: ZERO_LENGTH,
              spread: ZERO_LENGTH,
              inset: false
            };
            var c = 0;
            for (var i = 0; i < values.length; i++) {
              var token = values[i];
              if (isIdentWithValue(token, "inset")) {
                shadow.inset = true;
              } else if (isLength(token)) {
                if (c === 0) {
                  shadow.offsetX = token;
                } else if (c === 1) {
                  shadow.offsetY = token;
                } else if (c === 2) {
                  shadow.blur = token;
                } else {
                  shadow.spread = token;
                }
                c++;
              } else {
                shadow.color = color$1.parse(context, token);
              }
            }
            return shadow;
          });
        }
      };
      paintOrder = {
        name: "paint-order",
        initialValue: "normal",
        prefix: false,
        type: 1,
        parse: function(_context, tokens) {
          var DEFAULT_VALUE2 = [
            0,
            1,
            2
            /* MARKERS */
          ];
          var layers = [];
          tokens.filter(isIdentToken).forEach(function(token) {
            switch (token.value) {
              case "stroke":
                layers.push(
                  1
                  /* STROKE */
                );
                break;
              case "fill":
                layers.push(
                  0
                  /* FILL */
                );
                break;
              case "markers":
                layers.push(
                  2
                  /* MARKERS */
                );
                break;
            }
          });
          DEFAULT_VALUE2.forEach(function(value) {
            if (layers.indexOf(value) === -1) {
              layers.push(value);
            }
          });
          return layers;
        }
      };
      webkitTextStrokeColor = {
        name: "-webkit-text-stroke-color",
        initialValue: "currentcolor",
        prefix: false,
        type: 3,
        format: "color"
      };
      webkitTextStrokeWidth = {
        name: "-webkit-text-stroke-width",
        initialValue: "0",
        type: 0,
        prefix: false,
        parse: function(_context, token) {
          if (isDimensionToken(token)) {
            return token.number;
          }
          return 0;
        }
      };
      CSSParsedDeclaration = /** @class */
      (function() {
        function CSSParsedDeclaration2(context, declaration) {
          var _a, _b;
          this.animationDuration = parse(context, duration, declaration.animationDuration);
          this.backgroundClip = parse(context, backgroundClip, declaration.backgroundClip);
          this.backgroundColor = parse(context, backgroundColor, declaration.backgroundColor);
          this.backgroundImage = parse(context, backgroundImage, declaration.backgroundImage);
          this.backgroundOrigin = parse(context, backgroundOrigin, declaration.backgroundOrigin);
          this.backgroundPosition = parse(context, backgroundPosition, declaration.backgroundPosition);
          this.backgroundRepeat = parse(context, backgroundRepeat, declaration.backgroundRepeat);
          this.backgroundSize = parse(context, backgroundSize, declaration.backgroundSize);
          this.borderTopColor = parse(context, borderTopColor, declaration.borderTopColor);
          this.borderRightColor = parse(context, borderRightColor, declaration.borderRightColor);
          this.borderBottomColor = parse(context, borderBottomColor, declaration.borderBottomColor);
          this.borderLeftColor = parse(context, borderLeftColor, declaration.borderLeftColor);
          this.borderTopLeftRadius = parse(context, borderTopLeftRadius, declaration.borderTopLeftRadius);
          this.borderTopRightRadius = parse(context, borderTopRightRadius, declaration.borderTopRightRadius);
          this.borderBottomRightRadius = parse(context, borderBottomRightRadius, declaration.borderBottomRightRadius);
          this.borderBottomLeftRadius = parse(context, borderBottomLeftRadius, declaration.borderBottomLeftRadius);
          this.borderTopStyle = parse(context, borderTopStyle, declaration.borderTopStyle);
          this.borderRightStyle = parse(context, borderRightStyle, declaration.borderRightStyle);
          this.borderBottomStyle = parse(context, borderBottomStyle, declaration.borderBottomStyle);
          this.borderLeftStyle = parse(context, borderLeftStyle, declaration.borderLeftStyle);
          this.borderTopWidth = parse(context, borderTopWidth, declaration.borderTopWidth);
          this.borderRightWidth = parse(context, borderRightWidth, declaration.borderRightWidth);
          this.borderBottomWidth = parse(context, borderBottomWidth, declaration.borderBottomWidth);
          this.borderLeftWidth = parse(context, borderLeftWidth, declaration.borderLeftWidth);
          this.boxShadow = parse(context, boxShadow, declaration.boxShadow);
          this.color = parse(context, color, declaration.color);
          this.direction = parse(context, direction, declaration.direction);
          this.display = parse(context, display, declaration.display);
          this.float = parse(context, float, declaration.cssFloat);
          this.fontFamily = parse(context, fontFamily, declaration.fontFamily);
          this.fontSize = parse(context, fontSize, declaration.fontSize);
          this.fontStyle = parse(context, fontStyle, declaration.fontStyle);
          this.fontVariant = parse(context, fontVariant, declaration.fontVariant);
          this.fontWeight = parse(context, fontWeight, declaration.fontWeight);
          this.letterSpacing = parse(context, letterSpacing, declaration.letterSpacing);
          this.lineBreak = parse(context, lineBreak, declaration.lineBreak);
          this.lineHeight = parse(context, lineHeight, declaration.lineHeight);
          this.listStyleImage = parse(context, listStyleImage, declaration.listStyleImage);
          this.listStylePosition = parse(context, listStylePosition, declaration.listStylePosition);
          this.listStyleType = parse(context, listStyleType, declaration.listStyleType);
          this.marginTop = parse(context, marginTop, declaration.marginTop);
          this.marginRight = parse(context, marginRight, declaration.marginRight);
          this.marginBottom = parse(context, marginBottom, declaration.marginBottom);
          this.marginLeft = parse(context, marginLeft, declaration.marginLeft);
          this.opacity = parse(context, opacity, declaration.opacity);
          var overflowTuple = parse(context, overflow, declaration.overflow);
          this.overflowX = overflowTuple[0];
          this.overflowY = overflowTuple[overflowTuple.length > 1 ? 1 : 0];
          this.overflowWrap = parse(context, overflowWrap, declaration.overflowWrap);
          this.paddingTop = parse(context, paddingTop, declaration.paddingTop);
          this.paddingRight = parse(context, paddingRight, declaration.paddingRight);
          this.paddingBottom = parse(context, paddingBottom, declaration.paddingBottom);
          this.paddingLeft = parse(context, paddingLeft, declaration.paddingLeft);
          this.paintOrder = parse(context, paintOrder, declaration.paintOrder);
          this.position = parse(context, position, declaration.position);
          this.textAlign = parse(context, textAlign, declaration.textAlign);
          this.textDecorationColor = parse(context, textDecorationColor, (_a = declaration.textDecorationColor) !== null && _a !== void 0 ? _a : declaration.color);
          this.textDecorationLine = parse(context, textDecorationLine, (_b = declaration.textDecorationLine) !== null && _b !== void 0 ? _b : declaration.textDecoration);
          this.textShadow = parse(context, textShadow, declaration.textShadow);
          this.textTransform = parse(context, textTransform, declaration.textTransform);
          this.transform = parse(context, transform$1, declaration.transform);
          this.transformOrigin = parse(context, transformOrigin, declaration.transformOrigin);
          this.visibility = parse(context, visibility, declaration.visibility);
          this.webkitTextStrokeColor = parse(context, webkitTextStrokeColor, declaration.webkitTextStrokeColor);
          this.webkitTextStrokeWidth = parse(context, webkitTextStrokeWidth, declaration.webkitTextStrokeWidth);
          this.wordBreak = parse(context, wordBreak, declaration.wordBreak);
          this.zIndex = parse(context, zIndex, declaration.zIndex);
        }
        CSSParsedDeclaration2.prototype.isVisible = function() {
          return this.display > 0 && this.opacity > 0 && this.visibility === 0;
        };
        CSSParsedDeclaration2.prototype.isTransparent = function() {
          return isTransparent(this.backgroundColor);
        };
        CSSParsedDeclaration2.prototype.isTransformed = function() {
          return this.transform !== null;
        };
        CSSParsedDeclaration2.prototype.isPositioned = function() {
          return this.position !== 0;
        };
        CSSParsedDeclaration2.prototype.isPositionedWithZIndex = function() {
          return this.isPositioned() && !this.zIndex.auto;
        };
        CSSParsedDeclaration2.prototype.isFloating = function() {
          return this.float !== 0;
        };
        CSSParsedDeclaration2.prototype.isInlineLevel = function() {
          return contains(
            this.display,
            4
            /* INLINE */
          ) || contains(
            this.display,
            33554432
            /* INLINE_BLOCK */
          ) || contains(
            this.display,
            268435456
            /* INLINE_FLEX */
          ) || contains(
            this.display,
            536870912
            /* INLINE_GRID */
          ) || contains(
            this.display,
            67108864
            /* INLINE_LIST_ITEM */
          ) || contains(
            this.display,
            134217728
            /* INLINE_TABLE */
          );
        };
        return CSSParsedDeclaration2;
      })();
      CSSParsedPseudoDeclaration = /** @class */
      /* @__PURE__ */ (function() {
        function CSSParsedPseudoDeclaration2(context, declaration) {
          this.content = parse(context, content, declaration.content);
          this.quotes = parse(context, quotes, declaration.quotes);
        }
        return CSSParsedPseudoDeclaration2;
      })();
      CSSParsedCounterDeclaration = /** @class */
      /* @__PURE__ */ (function() {
        function CSSParsedCounterDeclaration2(context, declaration) {
          this.counterIncrement = parse(context, counterIncrement, declaration.counterIncrement);
          this.counterReset = parse(context, counterReset, declaration.counterReset);
        }
        return CSSParsedCounterDeclaration2;
      })();
      parse = function(context, descriptor, style) {
        var tokenizer = new Tokenizer();
        var value = style !== null && typeof style !== "undefined" ? style.toString() : descriptor.initialValue;
        tokenizer.write(value);
        var parser = new Parser(tokenizer.read());
        switch (descriptor.type) {
          case 2:
            var token = parser.parseComponentValue();
            return descriptor.parse(context, isIdentToken(token) ? token.value : descriptor.initialValue);
          case 0:
            return descriptor.parse(context, parser.parseComponentValue());
          case 1:
            return descriptor.parse(context, parser.parseComponentValues());
          case 4:
            return parser.parseComponentValue();
          case 3:
            switch (descriptor.format) {
              case "angle":
                return angle.parse(context, parser.parseComponentValue());
              case "color":
                return color$1.parse(context, parser.parseComponentValue());
              case "image":
                return image.parse(context, parser.parseComponentValue());
              case "length":
                var length_1 = parser.parseComponentValue();
                return isLength(length_1) ? length_1 : ZERO_LENGTH;
              case "length-percentage":
                var value_1 = parser.parseComponentValue();
                return isLengthPercentage(value_1) ? value_1 : ZERO_LENGTH;
              case "time":
                return time.parse(context, parser.parseComponentValue());
            }
            break;
        }
      };
      elementDebuggerAttribute = "data-html2canvas-debug";
      getElementDebugType = function(element) {
        var attribute = element.getAttribute(elementDebuggerAttribute);
        switch (attribute) {
          case "all":
            return 1;
          case "clone":
            return 2;
          case "parse":
            return 3;
          case "render":
            return 4;
          default:
            return 0;
        }
      };
      isDebugging = function(element, type) {
        var elementType = getElementDebugType(element);
        return elementType === 1 || type === elementType;
      };
      ElementContainer = /** @class */
      /* @__PURE__ */ (function() {
        function ElementContainer2(context, element) {
          this.context = context;
          this.textNodes = [];
          this.elements = [];
          this.flags = 0;
          if (isDebugging(
            element,
            3
            /* PARSE */
          )) {
            debugger;
          }
          this.styles = new CSSParsedDeclaration(context, window.getComputedStyle(element, null));
          if (isHTMLElementNode(element)) {
            if (this.styles.animationDuration.some(function(duration2) {
              return duration2 > 0;
            })) {
              element.style.animationDuration = "0s";
            }
            if (this.styles.transform !== null) {
              element.style.transform = "none";
            }
          }
          this.bounds = parseBounds(this.context, element);
          if (isDebugging(
            element,
            4
            /* RENDER */
          )) {
            this.flags |= 16;
          }
        }
        return ElementContainer2;
      })();
      base64 = "AAAAAAAAAAAAEA4AGBkAAFAaAAACAAAAAAAIABAAGAAwADgACAAQAAgAEAAIABAACAAQAAgAEAAIABAACAAQAAgAEAAIABAAQABIAEQATAAIABAACAAQAAgAEAAIABAAVABcAAgAEAAIABAACAAQAGAAaABwAHgAgACIAI4AlgAIABAAmwCjAKgAsAC2AL4AvQDFAMoA0gBPAVYBWgEIAAgACACMANoAYgFkAWwBdAF8AX0BhQGNAZUBlgGeAaMBlQGWAasBswF8AbsBwwF0AcsBYwHTAQgA2wG/AOMBdAF8AekB8QF0AfkB+wHiAHQBfAEIAAMC5gQIAAsCEgIIAAgAFgIeAggAIgIpAggAMQI5AkACygEIAAgASAJQAlgCYAIIAAgACAAKBQoFCgUTBRMFGQUrBSsFCAAIAAgACAAIAAgACAAIAAgACABdAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACABoAmgCrwGvAQgAbgJ2AggAHgEIAAgACADnAXsCCAAIAAgAgwIIAAgACAAIAAgACACKAggAkQKZAggAPADJAAgAoQKkAqwCsgK6AsICCADJAggA0AIIAAgACAAIANYC3gIIAAgACAAIAAgACABAAOYCCAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAkASoB+QIEAAgACAA8AEMCCABCBQgACABJBVAFCAAIAAgACAAIAAgACAAIAAgACABTBVoFCAAIAFoFCABfBWUFCAAIAAgACAAIAAgAbQUIAAgACAAIAAgACABzBXsFfQWFBYoFigWKBZEFigWKBYoFmAWfBaYFrgWxBbkFCAAIAAgACAAIAAgACAAIAAgACAAIAMEFCAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAMgFCADQBQgACAAIAAgACAAIAAgACAAIAAgACAAIAO4CCAAIAAgAiQAIAAgACABAAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAD0AggACAD8AggACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIANYFCAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAMDvwAIAAgAJAIIAAgACAAIAAgACAAIAAgACwMTAwgACAB9BOsEGwMjAwgAKwMyAwsFYgE3A/MEPwMIAEUDTQNRAwgAWQOsAGEDCAAIAAgACAAIAAgACABpAzQFNQU2BTcFOAU5BToFNAU1BTYFNwU4BTkFOgU0BTUFNgU3BTgFOQU6BTQFNQU2BTcFOAU5BToFNAU1BTYFNwU4BTkFOgU0BTUFNgU3BTgFOQU6BTQFNQU2BTcFOAU5BToFNAU1BTYFNwU4BTkFOgU0BTUFNgU3BTgFOQU6BTQFNQU2BTcFOAU5BToFNAU1BTYFNwU4BTkFOgU0BTUFNgU3BTgFOQU6BTQFNQU2BTcFOAU5BToFNAU1BTYFNwU4BTkFOgU0BTUFNgU3BTgFOQU6BTQFNQU2BTcFOAU5BToFNAU1BTYFNwU4BTkFOgU0BTUFNgU3BTgFOQU6BTQFNQU2BTcFOAU5BToFNAU1BTYFNwU4BTkFOgU0BTUFNgU3BTgFOQU6BTQFNQU2BTcFOAU5BToFNAU1BTYFNwU4BTkFOgU0BTUFNgU3BTgFOQU6BTQFNQU2BTcFOAU5BToFNAU1BTYFNwU4BTkFOgU0BTUFNgU3BTgFOQU6BTQFNQU2BTcFOAU5BToFNAU1BTYFNwU4BTkFOgU0BTUFNgU3BTgFOQU6BTQFNQU2BTcFOAU5BToFNAU1BTYFNwU4BTkFOgU0BTUFNgU3BTgFOQU6BTQFNQU2BTcFOAU5BToFNAU1BTYFNwU4BTkFOgU0BTUFNgU3BTgFOQU6BTQFNQU2BTcFOAU5BToFNAU1BTYFNwU4BTkFOgU0BTUFNgU3BTgFOQU6BTQFNQU2BTcFOAU5BToFNAU1BTYFNwU4BTkFOgU0BTUFNgU3BTgFOQU6BTQFNQU2BTcFOAU5BToFNAU1BTYFNwU4BTkFOgU0BTUFNgU3BTgFOQU6BTQFNQU2BTcFOAU5BToFNAU1BTYFNwU4BTkFOgU0BTUFNgU3BTgFOQU6BTQFNQU2BTcFOAU5BToFNAU1BTYFNwU4BTkFIQUoBSwFCAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACABtAwgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACABMAEwACAAIAAgACAAIABgACAAIAAgACAC/AAgACAAyAQgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACACAAIAAwAAgACAAIAAgACAAIAAgACAAIAAAARABIAAgACAAIABQASAAIAAgAIABwAEAAjgCIABsAqAC2AL0AigDQAtwC+IJIQqVAZUBWQqVAZUBlQGVAZUBlQGrC5UBlQGVAZUBlQGVAZUBlQGVAXsKlQGVAbAK6wsrDGUMpQzlDJUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAZUBlQGVAfAKAAuZA64AtwCJALoC6ADwAAgAuACgA/oEpgO6AqsD+AAIAAgAswMIAAgACAAIAIkAuwP5AfsBwwPLAwgACAAIAAgACADRA9kDCAAIAOED6QMIAAgACAAIAAgACADuA/YDCAAIAP4DyQAIAAgABgQIAAgAXQAOBAgACAAIAAgACAAIABMECAAIAAgACAAIAAgACAD8AAQBCAAIAAgAGgQiBCoECAExBAgAEAEIAAgACAAIAAgACAAIAAgACAAIAAgACAA4BAgACABABEYECAAIAAgATAQYAQgAVAQIAAgACAAIAAgACAAIAAgACAAIAFoECAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAOQEIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAB+BAcACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAEABhgSMBAgACAAIAAgAlAQIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAwAEAAQABAADAAMAAwADAAQABAAEAAQABAAEAAQABHATAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAdQMIAAgACAAIAAgACAAIAMkACAAIAAgAfQMIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACACFA4kDCAAIAAgACAAIAOcBCAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAIcDCAAIAAgACAAIAAgACAAIAAgACAAIAJEDCAAIAAgACADFAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACABgBAgAZgQIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAbAQCBXIECAAIAHkECAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACABAAJwEQACjBKoEsgQIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAC6BMIECAAIAAgACAAIAAgACABmBAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAxwQIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAGYECAAIAAgAzgQIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAigWKBYoFigWKBYoFigWKBd0FXwUIAOIF6gXxBYoF3gT5BQAGCAaKBYoFigWKBYoFigWKBYoFigWKBYoFigXWBIoFigWKBYoFigWKBYoFigWKBYsFEAaKBYoFigWKBYoFigWKBRQGCACKBYoFigWKBQgACAAIANEECAAIABgGigUgBggAJgYIAC4GMwaKBYoF0wQ3Bj4GigWKBYoFigWKBYoFigWKBYoFigWKBYoFigUIAAgACAAIAAgACAAIAAgAigWKBYoFigWKBYoFigWKBYoFigWKBYoFigWKBYoFigWKBYoFigWKBYoFigWKBYoFigWKBYoFigWKBYoFigWLBf///////wQABAAEAAQABAAEAAQABAAEAAQAAwAEAAQAAgAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAAAAAAAAAAAAAAAAAAAAAAAAAOAAAAAAAAAAQADgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABQAFAAUABQAFAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAUAAAAFAAUAAAAFAAUAAAAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAEAAQABAAEAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABQAFAAUABQAFAAUAAQAAAAUABQAFAAUABQAFAAAAAAAFAAUAAAAFAAUABQAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAUABQAFAAUABQAFAAUABQAAAAAAAAAAAAAAAAAAAAAAAAAFAAAAAAAFAAUAAQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABwAFAAUABQAFAAAABwAHAAcAAAAHAAcABwAFAAEAAAAAAAAAAAAAAAAAAAAAAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHAAcABwAFAAUABQAFAAcABwAFAAUAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHAAAAAQABAAAAAAAAAAAAAAAFAAUABQAFAAAABwAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAHAAcABwAHAAcAAAAHAAcAAAAAAAUABQAHAAUAAQAHAAEABwAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAFAAUABQAFAAUABwABAAUABQAFAAUAAAAAAAAAAAAAAAEAAQABAAEAAQABAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABwAFAAUAAAAAAAAAAAAAAAAABQAFAAUABQAFAAUAAQAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABQAFAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQABQANAAQABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQABAAEAAQABAAEAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAEAAQABAAEAAQABAAEAAQABAAEAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAQABAAEAAQABAAEAAQABAAAAAAAAAAAAAAAAAAAAAAABQAHAAUABQAFAAAAAAAAAAcABQAFAAUABQAFAAQABAAEAAQABAAEAAQABAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABQAFAAUAAAAFAAUABQAFAAUAAAAFAAUABQAAAAUABQAFAAUABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAUABQAAAAAAAAAAAAUABQAFAAcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAHAAUAAAAHAAcABwAFAAUABQAFAAUABQAFAAUABwAHAAcABwAFAAcABwAAAAUABQAFAAUABQAFAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABwAHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAAAAUABwAHAAUABQAFAAUAAAAAAAcABwAAAAAABwAHAAUAAAAAAAAAAAAAAAAAAAAAAAAABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAAAAAABQAFAAcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAAABwAHAAcABQAFAAAAAAAAAAAABQAFAAAAAAAFAAUABQAAAAAAAAAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABQAAAAAAAAAFAAAAAAAAAAAAAAAAAAAAAAAAAAAABwAFAAUABQAFAAUAAAAFAAUABwAAAAcABwAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAUABQAFAAUABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUAAAAFAAUABwAFAAUABQAFAAAAAAAHAAcAAAAAAAcABwAFAAAAAAAAAAAAAAAAAAAABQAFAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAcABwAAAAAAAAAHAAcABwAAAAcABwAHAAUAAAAAAAAAAAAAAAAAAAAAAAAABQAAAAAAAAAAAAAAAAAAAAAABQAHAAcABwAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABwAHAAcABwAAAAUABQAFAAAABQAFAAUABQAAAAAAAAAAAAAAAAAAAAUABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAAAAcABQAHAAcABQAHAAcAAAAFAAcABwAAAAcABwAFAAUAAAAAAAAAAAAAAAAAAAAFAAUAAAAAAAAAAAAAAAAAAAAAAAAABQAFAAcABwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABQAAAAUABwAAAAAAAAAAAAAAAAAAAAAAAAAAAAUAAAAAAAAAAAAFAAcABwAFAAUABQAAAAUAAAAHAAcABwAHAAcABwAHAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUAAAAHAAUABQAFAAUABQAFAAUAAAAAAAAAAAAAAAAAAAAAAAUABQAFAAUABQAFAAUABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAAABwAFAAUABQAFAAUABQAFAAUABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAFAAUABQAFAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAAAAUAAAAFAAAAAAAAAAAABwAHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABwAFAAUABQAFAAUAAAAFAAUAAAAAAAAAAAAAAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABQAFAAUABwAFAAUABQAFAAUABQAAAAUABQAHAAcABQAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHAAcABQAFAAAAAAAAAAAABQAFAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAUABQAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAAAAcABQAFAAAAAAAAAAAAAAAAAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAFAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABQAHAAUABQAFAAUABQAFAAUABwAHAAcABwAHAAcABwAHAAUABwAHAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAAAAAAAAAAAAAAAAAAAAAAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAFAAUABwAHAAcABwAFAAUABwAHAAcAAAAAAAAAAAAHAAcABQAHAAcABwAHAAcABwAFAAUABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAFAAcABwAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAcABQAHAAUABQAFAAUABQAFAAUAAAAFAAAABQAAAAAABQAFAAUABQAFAAUABQAFAAcABwAHAAcABwAHAAUABQAFAAUABQAFAAUABQAFAAUAAAAAAAUABQAFAAUABQAHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABQAFAAUABQAFAAUABwAFAAcABwAHAAcABwAFAAcABwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAUABQAFAAUABQAFAAUABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAUABwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHAAUABQAFAAUABwAHAAUABQAHAAUABQAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAcABQAFAAcABwAHAAUABwAFAAUABQAHAAcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABwAHAAcABwAHAAcABwAHAAUABQAFAAUABQAFAAUABQAHAAcABQAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAFAAUAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAcABQAFAAUABQAFAAUABQAAAAAAAAAAAAUAAAAAAAAAAAAAAAAABQAAAAAABwAFAAUAAAAAAAAAAAAAAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAAABQAFAAUABQAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABQAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAFAAUABQAFAAUADgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABQAFAAUAAAAFAAUABQAFAAUABQAFAAUABQAFAAAAAAAAAAAABQAAAAAAAAAFAAAAAAAAAAAABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABwAHAAUABQAHAAAAAAAAAAAABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAcABwAHAAcABQAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUAAAAAAAAAAAAAAAAABQAFAAUABQAFAAUABQAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABQAFAAUABQAFAAUABQAFAAUABQAHAAcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAcABwAFAAUABQAFAAcABwAFAAUABwAHAAAAAAAAAAAAAAAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABQAFAAUABQAFAAcABwAFAAUABwAHAAUABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAAAAAAAAAAAAAAAAAAAAAAFAAcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUAAAAFAAUABQAAAAAABQAFAAAAAAAAAAAAAAAFAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAcABQAFAAcABwAAAAAAAAAAAAAABwAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAcABwAFAAcABwAFAAcABwAAAAcABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABQAFAAUABQAAAAAAAAAAAAAAAAAFAAUABQAAAAUABQAAAAAAAAAAAAAABQAFAAUABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAUABQAAAAAAAAAAAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAcABQAHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAUABQAFAAUABwAFAAUABQAFAAUABQAFAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABwAHAAcABQAFAAUABQAFAAUABQAFAAUABwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHAAcABwAFAAUABQAHAAcABQAHAAUABQAAAAAAAAAAAAAAAAAFAAAABwAHAAcABQAFAAUABQAFAAUABQAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABwAHAAcABwAAAAAABwAHAAAAAAAHAAcABwAAAAAAAAAAAAAAAAAAAAAAAAAFAAAAAAAAAAAAAAAAAAAAAAAAAAAABwAHAAAAAAAFAAUABQAFAAUABQAFAAAAAAAAAAUABQAFAAUABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHAAcABwAFAAUABQAFAAUABQAFAAUABwAHAAUABQAFAAcABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAHAAcABQAFAAUABQAFAAUABwAFAAcABwAFAAcABQAFAAcABQAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAHAAcABQAFAAUABQAAAAAABwAHAAcABwAFAAUABwAFAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAcABwAHAAUABQAFAAUABQAFAAUABQAHAAcABQAHAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABwAFAAcABwAFAAUABQAFAAUABQAHAAUAAAAAAAAAAAAAAAAAAAAAAAcABwAFAAUABQAFAAcABQAFAAUABQAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHAAcABwAFAAUABQAFAAUABQAFAAUABQAHAAUABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHAAcABwAFAAUABQAFAAAAAAAFAAUABwAHAAcABwAFAAAAAAAAAAcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUAAAAAAAAAAAAAAAAAAAAAAAAABQAFAAUABQAFAAUABwAHAAUABQAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAcABQAFAAUABQAFAAUABQAAAAUABQAFAAUABQAFAAcABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAHAAUABQAFAAUABQAFAAUABwAFAAUABwAFAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAFAAUABQAFAAUAAAAAAAAABQAAAAUABQAAAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAHAAcABwAHAAcAAAAFAAUAAAAHAAcABQAHAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAUABwAHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAUABQAFAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAUABQAFAAUABQAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAAAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAAAAAAAAAAAAAAAAAAABQAFAAUABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAcABwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABQAAAAUABQAFAAAAAAAFAAUABQAFAAUABQAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAFAAUABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAFAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAAAAAAAAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAAAAAAAAAAAAAAAAAAAAAAFAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABQAFAAUABQAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAFAAUABQAFAAUABQAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAAABQAFAAUABQAFAAUABQAAAAUABQAAAAUABQAFAAUABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAUABQAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAFAAUABQAFAAUABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAFAAUABQAFAAUADgAOAA4ADgAOAA4ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAcABwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABwAHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAAAAAAAAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAMAAwADAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkAAAAAAAAAAAAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAAAAAAAAAAAAsADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwACwAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAAAAAADgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOAA4ADgAOAA4ADgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgAOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4ADgAAAAAAAAAAAAAAAAAAAAAADgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgAOAA4ADgAOAA4ADgAOAA4ADgAOAAAAAAAAAAAADgAOAA4AAAAAAAAAAAAAAAAAAAAOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgAOAAAAAAAAAAAAAAAAAAAAAAAAAAAADgAAAAAAAAAAAAAAAAAAAAAAAAAOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgAOAA4ADgAAAA4ADgAOAA4ADgAOAAAADgAOAA4ADgAOAA4ADgAOAA4ADgAOAA4AAAAOAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAOAAAAAAAAAAAAAAAAAAAAAAAAAAAADgAOAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAOAA4AAAAAAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAAAA4AAAAOAAAAAAAAAAAAAAAAAA4AAAAAAAAAAAAAAAAADgAAAAAAAAAAAAAAAAAAAAAAAAAAAA4ADgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgAAAAAADgAAAAAAAAAAAA4AAAAOAAAAAAAAAAAADgAOAA4AAAAOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOAA4ADgAOAA4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOAA4ADgAAAAAAAAAAAAAAAAAAAAAAAAAOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOAA4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4ADgAOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgAOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgAAAAAAAAAAAA4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOAAAADgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOAA4ADgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4ADgAOAA4ADgAOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4ADgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgAAAAAADgAOAA4ADgAOAA4ADgAOAA4ADgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgAOAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAAAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAOAAAAAAAAAAAAAAAAAAAAAAAAAAAADgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4AAAAAAA4ADgAOAA4ADgAOAA4ADgAOAAAADgAOAA4ADgAAAAAAAAAAAAAAAAAAAAAAAAAOAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAOAA4AAAAAAAAAAAAAAAAADgAOAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOAA4ADgAOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgAOAA4ADgAOAA4ADgAOAAAAAAAAAAAAAAAAAAAAAAAAAAAADgAOAA4ADgAOAA4AAAAAAAAAAAAAAAAAAAAAAA4ADgAOAA4ADgAOAA4ADgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAOAA4AAAAOAA4ADgAOAA4ADgAAAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAOAA4AAAAAAAAAAAA=";
      chars$1 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
      lookup$1 = typeof Uint8Array === "undefined" ? [] : new Uint8Array(256);
      for (i$1 = 0; i$1 < chars$1.length; i$1++) {
        lookup$1[chars$1.charCodeAt(i$1)] = i$1;
      }
      decode = function(base642) {
        var bufferLength = base642.length * 0.75, len = base642.length, i, p = 0, encoded1, encoded2, encoded3, encoded4;
        if (base642[base642.length - 1] === "=") {
          bufferLength--;
          if (base642[base642.length - 2] === "=") {
            bufferLength--;
          }
        }
        var buffer = typeof ArrayBuffer !== "undefined" && typeof Uint8Array !== "undefined" && typeof Uint8Array.prototype.slice !== "undefined" ? new ArrayBuffer(bufferLength) : new Array(bufferLength);
        var bytes = Array.isArray(buffer) ? buffer : new Uint8Array(buffer);
        for (i = 0; i < len; i += 4) {
          encoded1 = lookup$1[base642.charCodeAt(i)];
          encoded2 = lookup$1[base642.charCodeAt(i + 1)];
          encoded3 = lookup$1[base642.charCodeAt(i + 2)];
          encoded4 = lookup$1[base642.charCodeAt(i + 3)];
          bytes[p++] = encoded1 << 2 | encoded2 >> 4;
          bytes[p++] = (encoded2 & 15) << 4 | encoded3 >> 2;
          bytes[p++] = (encoded3 & 3) << 6 | encoded4 & 63;
        }
        return buffer;
      };
      polyUint16Array = function(buffer) {
        var length = buffer.length;
        var bytes = [];
        for (var i = 0; i < length; i += 2) {
          bytes.push(buffer[i + 1] << 8 | buffer[i]);
        }
        return bytes;
      };
      polyUint32Array = function(buffer) {
        var length = buffer.length;
        var bytes = [];
        for (var i = 0; i < length; i += 4) {
          bytes.push(buffer[i + 3] << 24 | buffer[i + 2] << 16 | buffer[i + 1] << 8 | buffer[i]);
        }
        return bytes;
      };
      UTRIE2_SHIFT_2 = 5;
      UTRIE2_SHIFT_1 = 6 + 5;
      UTRIE2_INDEX_SHIFT = 2;
      UTRIE2_SHIFT_1_2 = UTRIE2_SHIFT_1 - UTRIE2_SHIFT_2;
      UTRIE2_LSCP_INDEX_2_OFFSET = 65536 >> UTRIE2_SHIFT_2;
      UTRIE2_DATA_BLOCK_LENGTH = 1 << UTRIE2_SHIFT_2;
      UTRIE2_DATA_MASK = UTRIE2_DATA_BLOCK_LENGTH - 1;
      UTRIE2_LSCP_INDEX_2_LENGTH = 1024 >> UTRIE2_SHIFT_2;
      UTRIE2_INDEX_2_BMP_LENGTH = UTRIE2_LSCP_INDEX_2_OFFSET + UTRIE2_LSCP_INDEX_2_LENGTH;
      UTRIE2_UTF8_2B_INDEX_2_OFFSET = UTRIE2_INDEX_2_BMP_LENGTH;
      UTRIE2_UTF8_2B_INDEX_2_LENGTH = 2048 >> 6;
      UTRIE2_INDEX_1_OFFSET = UTRIE2_UTF8_2B_INDEX_2_OFFSET + UTRIE2_UTF8_2B_INDEX_2_LENGTH;
      UTRIE2_OMITTED_BMP_INDEX_1_LENGTH = 65536 >> UTRIE2_SHIFT_1;
      UTRIE2_INDEX_2_BLOCK_LENGTH = 1 << UTRIE2_SHIFT_1_2;
      UTRIE2_INDEX_2_MASK = UTRIE2_INDEX_2_BLOCK_LENGTH - 1;
      slice16 = function(view, start, end) {
        if (view.slice) {
          return view.slice(start, end);
        }
        return new Uint16Array(Array.prototype.slice.call(view, start, end));
      };
      slice32 = function(view, start, end) {
        if (view.slice) {
          return view.slice(start, end);
        }
        return new Uint32Array(Array.prototype.slice.call(view, start, end));
      };
      createTrieFromBase64 = function(base642, _byteLength) {
        var buffer = decode(base642);
        var view32 = Array.isArray(buffer) ? polyUint32Array(buffer) : new Uint32Array(buffer);
        var view16 = Array.isArray(buffer) ? polyUint16Array(buffer) : new Uint16Array(buffer);
        var headerLength = 24;
        var index = slice16(view16, headerLength / 2, view32[4] / 2);
        var data = view32[5] === 2 ? slice16(view16, (headerLength + view32[4]) / 2) : slice32(view32, Math.ceil((headerLength + view32[4]) / 4));
        return new Trie(view32[0], view32[1], view32[2], view32[3], index, data);
      };
      Trie = /** @class */
      (function() {
        function Trie2(initialValue, errorValue, highStart, highValueIndex, index, data) {
          this.initialValue = initialValue;
          this.errorValue = errorValue;
          this.highStart = highStart;
          this.highValueIndex = highValueIndex;
          this.index = index;
          this.data = data;
        }
        Trie2.prototype.get = function(codePoint) {
          var ix;
          if (codePoint >= 0) {
            if (codePoint < 55296 || codePoint > 56319 && codePoint <= 65535) {
              ix = this.index[codePoint >> UTRIE2_SHIFT_2];
              ix = (ix << UTRIE2_INDEX_SHIFT) + (codePoint & UTRIE2_DATA_MASK);
              return this.data[ix];
            }
            if (codePoint <= 65535) {
              ix = this.index[UTRIE2_LSCP_INDEX_2_OFFSET + (codePoint - 55296 >> UTRIE2_SHIFT_2)];
              ix = (ix << UTRIE2_INDEX_SHIFT) + (codePoint & UTRIE2_DATA_MASK);
              return this.data[ix];
            }
            if (codePoint < this.highStart) {
              ix = UTRIE2_INDEX_1_OFFSET - UTRIE2_OMITTED_BMP_INDEX_1_LENGTH + (codePoint >> UTRIE2_SHIFT_1);
              ix = this.index[ix];
              ix += codePoint >> UTRIE2_SHIFT_2 & UTRIE2_INDEX_2_MASK;
              ix = this.index[ix];
              ix = (ix << UTRIE2_INDEX_SHIFT) + (codePoint & UTRIE2_DATA_MASK);
              return this.data[ix];
            }
            if (codePoint <= 1114111) {
              return this.data[this.highValueIndex];
            }
          }
          return this.errorValue;
        };
        return Trie2;
      })();
      chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
      lookup = typeof Uint8Array === "undefined" ? [] : new Uint8Array(256);
      for (i = 0; i < chars.length; i++) {
        lookup[chars.charCodeAt(i)] = i;
      }
      Prepend = 1;
      CR = 2;
      LF = 3;
      Control = 4;
      Extend = 5;
      SpacingMark = 7;
      L = 8;
      V = 9;
      T = 10;
      LV = 11;
      LVT = 12;
      ZWJ = 13;
      Extended_Pictographic = 14;
      RI = 15;
      toCodePoints = function(str) {
        var codePoints = [];
        var i = 0;
        var length = str.length;
        while (i < length) {
          var value = str.charCodeAt(i++);
          if (value >= 55296 && value <= 56319 && i < length) {
            var extra = str.charCodeAt(i++);
            if ((extra & 64512) === 56320) {
              codePoints.push(((value & 1023) << 10) + (extra & 1023) + 65536);
            } else {
              codePoints.push(value);
              i--;
            }
          } else {
            codePoints.push(value);
          }
        }
        return codePoints;
      };
      fromCodePoint = function() {
        var codePoints = [];
        for (var _i = 0; _i < arguments.length; _i++) {
          codePoints[_i] = arguments[_i];
        }
        if (String.fromCodePoint) {
          return String.fromCodePoint.apply(String, codePoints);
        }
        var length = codePoints.length;
        if (!length) {
          return "";
        }
        var codeUnits = [];
        var index = -1;
        var result = "";
        while (++index < length) {
          var codePoint = codePoints[index];
          if (codePoint <= 65535) {
            codeUnits.push(codePoint);
          } else {
            codePoint -= 65536;
            codeUnits.push((codePoint >> 10) + 55296, codePoint % 1024 + 56320);
          }
          if (index + 1 === length || codeUnits.length > 16384) {
            result += String.fromCharCode.apply(String, codeUnits);
            codeUnits.length = 0;
          }
        }
        return result;
      };
      UnicodeTrie = createTrieFromBase64(base64);
      BREAK_NOT_ALLOWED = "\xD7";
      BREAK_ALLOWED = "\xF7";
      codePointToClass = function(codePoint) {
        return UnicodeTrie.get(codePoint);
      };
      _graphemeBreakAtIndex = function(_codePoints, classTypes, index) {
        var prevIndex = index - 2;
        var prev = classTypes[prevIndex];
        var current = classTypes[index - 1];
        var next = classTypes[index];
        if (current === CR && next === LF) {
          return BREAK_NOT_ALLOWED;
        }
        if (current === CR || current === LF || current === Control) {
          return BREAK_ALLOWED;
        }
        if (next === CR || next === LF || next === Control) {
          return BREAK_ALLOWED;
        }
        if (current === L && [L, V, LV, LVT].indexOf(next) !== -1) {
          return BREAK_NOT_ALLOWED;
        }
        if ((current === LV || current === V) && (next === V || next === T)) {
          return BREAK_NOT_ALLOWED;
        }
        if ((current === LVT || current === T) && next === T) {
          return BREAK_NOT_ALLOWED;
        }
        if (next === ZWJ || next === Extend) {
          return BREAK_NOT_ALLOWED;
        }
        if (next === SpacingMark) {
          return BREAK_NOT_ALLOWED;
        }
        if (current === Prepend) {
          return BREAK_NOT_ALLOWED;
        }
        if (current === ZWJ && next === Extended_Pictographic) {
          while (prev === Extend) {
            prev = classTypes[--prevIndex];
          }
          if (prev === Extended_Pictographic) {
            return BREAK_NOT_ALLOWED;
          }
        }
        if (current === RI && next === RI) {
          var countRI = 0;
          while (prev === RI) {
            countRI++;
            prev = classTypes[--prevIndex];
          }
          if (countRI % 2 === 0) {
            return BREAK_NOT_ALLOWED;
          }
        }
        return BREAK_ALLOWED;
      };
      GraphemeBreaker = function(str) {
        var codePoints = toCodePoints(str);
        var length = codePoints.length;
        var index = 0;
        var lastEnd = 0;
        var classTypes = codePoints.map(codePointToClass);
        return {
          next: function() {
            if (index >= length) {
              return { done: true, value: null };
            }
            var graphemeBreak = BREAK_NOT_ALLOWED;
            while (index < length && (graphemeBreak = _graphemeBreakAtIndex(codePoints, classTypes, ++index)) === BREAK_NOT_ALLOWED) {
            }
            if (graphemeBreak !== BREAK_NOT_ALLOWED || index === length) {
              var value = fromCodePoint.apply(null, codePoints.slice(lastEnd, index));
              lastEnd = index;
              return { value, done: false };
            }
            return { done: true, value: null };
          }
        };
      };
      splitGraphemes = function(str) {
        var breaker = GraphemeBreaker(str);
        var graphemes = [];
        var bk;
        while (!(bk = breaker.next()).done) {
          if (bk.value) {
            graphemes.push(bk.value.slice());
          }
        }
        return graphemes;
      };
      testRangeBounds = function(document2) {
        var TEST_HEIGHT = 123;
        if (document2.createRange) {
          var range = document2.createRange();
          if (range.getBoundingClientRect) {
            var testElement = document2.createElement("boundtest");
            testElement.style.height = TEST_HEIGHT + "px";
            testElement.style.display = "block";
            document2.body.appendChild(testElement);
            range.selectNode(testElement);
            var rangeBounds = range.getBoundingClientRect();
            var rangeHeight = Math.round(rangeBounds.height);
            document2.body.removeChild(testElement);
            if (rangeHeight === TEST_HEIGHT) {
              return true;
            }
          }
        }
        return false;
      };
      testIOSLineBreak = function(document2) {
        var testElement = document2.createElement("boundtest");
        testElement.style.width = "50px";
        testElement.style.display = "block";
        testElement.style.fontSize = "12px";
        testElement.style.letterSpacing = "0px";
        testElement.style.wordSpacing = "0px";
        document2.body.appendChild(testElement);
        var range = document2.createRange();
        testElement.innerHTML = typeof "".repeat === "function" ? "&#128104;".repeat(10) : "";
        var node = testElement.firstChild;
        var textList = toCodePoints$1(node.data).map(function(i) {
          return fromCodePoint$1(i);
        });
        var offset = 0;
        var prev = {};
        var supports = textList.every(function(text, i) {
          range.setStart(node, offset);
          range.setEnd(node, offset + text.length);
          var rect = range.getBoundingClientRect();
          offset += text.length;
          var boundAhead = rect.x > prev.x || rect.y > prev.y;
          prev = rect;
          if (i === 0) {
            return true;
          }
          return boundAhead;
        });
        document2.body.removeChild(testElement);
        return supports;
      };
      testCORS = function() {
        return typeof new Image().crossOrigin !== "undefined";
      };
      testResponseType = function() {
        return typeof new XMLHttpRequest().responseType === "string";
      };
      testSVG = function(document2) {
        var img = new Image();
        var canvas = document2.createElement("canvas");
        var ctx = canvas.getContext("2d");
        if (!ctx) {
          return false;
        }
        img.src = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'></svg>";
        try {
          ctx.drawImage(img, 0, 0);
          canvas.toDataURL();
        } catch (e2) {
          return false;
        }
        return true;
      };
      isGreenPixel = function(data) {
        return data[0] === 0 && data[1] === 255 && data[2] === 0 && data[3] === 255;
      };
      testForeignObject = function(document2) {
        var canvas = document2.createElement("canvas");
        var size = 100;
        canvas.width = size;
        canvas.height = size;
        var ctx = canvas.getContext("2d");
        if (!ctx) {
          return Promise.reject(false);
        }
        ctx.fillStyle = "rgb(0, 255, 0)";
        ctx.fillRect(0, 0, size, size);
        var img = new Image();
        var greenImageSrc = canvas.toDataURL();
        img.src = greenImageSrc;
        var svg = createForeignObjectSVG(size, size, 0, 0, img);
        ctx.fillStyle = "red";
        ctx.fillRect(0, 0, size, size);
        return loadSerializedSVG$1(svg).then(function(img2) {
          ctx.drawImage(img2, 0, 0);
          var data = ctx.getImageData(0, 0, size, size).data;
          ctx.fillStyle = "red";
          ctx.fillRect(0, 0, size, size);
          var node = document2.createElement("div");
          node.style.backgroundImage = "url(" + greenImageSrc + ")";
          node.style.height = size + "px";
          return isGreenPixel(data) ? loadSerializedSVG$1(createForeignObjectSVG(size, size, 0, 0, node)) : Promise.reject(false);
        }).then(function(img2) {
          ctx.drawImage(img2, 0, 0);
          return isGreenPixel(ctx.getImageData(0, 0, size, size).data);
        }).catch(function() {
          return false;
        });
      };
      createForeignObjectSVG = function(width, height, x, y, node) {
        var xmlns = "http://www.w3.org/2000/svg";
        var svg = document.createElementNS(xmlns, "svg");
        var foreignObject = document.createElementNS(xmlns, "foreignObject");
        svg.setAttributeNS(null, "width", width.toString());
        svg.setAttributeNS(null, "height", height.toString());
        foreignObject.setAttributeNS(null, "width", "100%");
        foreignObject.setAttributeNS(null, "height", "100%");
        foreignObject.setAttributeNS(null, "x", x.toString());
        foreignObject.setAttributeNS(null, "y", y.toString());
        foreignObject.setAttributeNS(null, "externalResourcesRequired", "true");
        svg.appendChild(foreignObject);
        foreignObject.appendChild(node);
        return svg;
      };
      loadSerializedSVG$1 = function(svg) {
        return new Promise(function(resolve, reject) {
          var img = new Image();
          img.onload = function() {
            return resolve(img);
          };
          img.onerror = reject;
          img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(svg));
        });
      };
      FEATURES = {
        get SUPPORT_RANGE_BOUNDS() {
          var value = testRangeBounds(document);
          Object.defineProperty(FEATURES, "SUPPORT_RANGE_BOUNDS", { value });
          return value;
        },
        get SUPPORT_WORD_BREAKING() {
          var value = FEATURES.SUPPORT_RANGE_BOUNDS && testIOSLineBreak(document);
          Object.defineProperty(FEATURES, "SUPPORT_WORD_BREAKING", { value });
          return value;
        },
        get SUPPORT_SVG_DRAWING() {
          var value = testSVG(document);
          Object.defineProperty(FEATURES, "SUPPORT_SVG_DRAWING", { value });
          return value;
        },
        get SUPPORT_FOREIGNOBJECT_DRAWING() {
          var value = typeof Array.from === "function" && typeof window.fetch === "function" ? testForeignObject(document) : Promise.resolve(false);
          Object.defineProperty(FEATURES, "SUPPORT_FOREIGNOBJECT_DRAWING", { value });
          return value;
        },
        get SUPPORT_CORS_IMAGES() {
          var value = testCORS();
          Object.defineProperty(FEATURES, "SUPPORT_CORS_IMAGES", { value });
          return value;
        },
        get SUPPORT_RESPONSE_TYPE() {
          var value = testResponseType();
          Object.defineProperty(FEATURES, "SUPPORT_RESPONSE_TYPE", { value });
          return value;
        },
        get SUPPORT_CORS_XHR() {
          var value = "withCredentials" in new XMLHttpRequest();
          Object.defineProperty(FEATURES, "SUPPORT_CORS_XHR", { value });
          return value;
        },
        get SUPPORT_NATIVE_TEXT_SEGMENTATION() {
          var value = !!(typeof Intl !== "undefined" && Intl.Segmenter);
          Object.defineProperty(FEATURES, "SUPPORT_NATIVE_TEXT_SEGMENTATION", { value });
          return value;
        }
      };
      TextBounds = /** @class */
      /* @__PURE__ */ (function() {
        function TextBounds2(text, bounds) {
          this.text = text;
          this.bounds = bounds;
        }
        return TextBounds2;
      })();
      parseTextBounds = function(context, value, styles, node) {
        var textList = breakText(value, styles);
        var textBounds = [];
        var offset = 0;
        textList.forEach(function(text) {
          if (styles.textDecorationLine.length || text.trim().length > 0) {
            if (FEATURES.SUPPORT_RANGE_BOUNDS) {
              var clientRects = createRange(node, offset, text.length).getClientRects();
              if (clientRects.length > 1) {
                var subSegments = segmentGraphemes(text);
                var subOffset_1 = 0;
                subSegments.forEach(function(subSegment) {
                  textBounds.push(new TextBounds(subSegment, Bounds.fromDOMRectList(context, createRange(node, subOffset_1 + offset, subSegment.length).getClientRects())));
                  subOffset_1 += subSegment.length;
                });
              } else {
                textBounds.push(new TextBounds(text, Bounds.fromDOMRectList(context, clientRects)));
              }
            } else {
              var replacementNode = node.splitText(text.length);
              textBounds.push(new TextBounds(text, getWrapperBounds(context, node)));
              node = replacementNode;
            }
          } else if (!FEATURES.SUPPORT_RANGE_BOUNDS) {
            node = node.splitText(text.length);
          }
          offset += text.length;
        });
        return textBounds;
      };
      getWrapperBounds = function(context, node) {
        var ownerDocument = node.ownerDocument;
        if (ownerDocument) {
          var wrapper = ownerDocument.createElement("html2canvaswrapper");
          wrapper.appendChild(node.cloneNode(true));
          var parentNode = node.parentNode;
          if (parentNode) {
            parentNode.replaceChild(wrapper, node);
            var bounds = parseBounds(context, wrapper);
            if (wrapper.firstChild) {
              parentNode.replaceChild(wrapper.firstChild, wrapper);
            }
            return bounds;
          }
        }
        return Bounds.EMPTY;
      };
      createRange = function(node, offset, length) {
        var ownerDocument = node.ownerDocument;
        if (!ownerDocument) {
          throw new Error("Node has no owner document");
        }
        var range = ownerDocument.createRange();
        range.setStart(node, offset);
        range.setEnd(node, offset + length);
        return range;
      };
      segmentGraphemes = function(value) {
        if (FEATURES.SUPPORT_NATIVE_TEXT_SEGMENTATION) {
          var segmenter = new Intl.Segmenter(void 0, { granularity: "grapheme" });
          return Array.from(segmenter.segment(value)).map(function(segment) {
            return segment.segment;
          });
        }
        return splitGraphemes(value);
      };
      segmentWords = function(value, styles) {
        if (FEATURES.SUPPORT_NATIVE_TEXT_SEGMENTATION) {
          var segmenter = new Intl.Segmenter(void 0, {
            granularity: "word"
          });
          return Array.from(segmenter.segment(value)).map(function(segment) {
            return segment.segment;
          });
        }
        return breakWords(value, styles);
      };
      breakText = function(value, styles) {
        return styles.letterSpacing !== 0 ? segmentGraphemes(value) : segmentWords(value, styles);
      };
      wordSeparators = [32, 160, 4961, 65792, 65793, 4153, 4241];
      breakWords = function(str, styles) {
        var breaker = LineBreaker(str, {
          lineBreak: styles.lineBreak,
          wordBreak: styles.overflowWrap === "break-word" ? "break-word" : styles.wordBreak
        });
        var words = [];
        var bk;
        var _loop_1 = function() {
          if (bk.value) {
            var value = bk.value.slice();
            var codePoints = toCodePoints$1(value);
            var word_1 = "";
            codePoints.forEach(function(codePoint) {
              if (wordSeparators.indexOf(codePoint) === -1) {
                word_1 += fromCodePoint$1(codePoint);
              } else {
                if (word_1.length) {
                  words.push(word_1);
                }
                words.push(fromCodePoint$1(codePoint));
                word_1 = "";
              }
            });
            if (word_1.length) {
              words.push(word_1);
            }
          }
        };
        while (!(bk = breaker.next()).done) {
          _loop_1();
        }
        return words;
      };
      TextContainer = /** @class */
      /* @__PURE__ */ (function() {
        function TextContainer2(context, node, styles) {
          this.text = transform(node.data, styles.textTransform);
          this.textBounds = parseTextBounds(context, this.text, styles, node);
        }
        return TextContainer2;
      })();
      transform = function(text, transform2) {
        switch (transform2) {
          case 1:
            return text.toLowerCase();
          case 3:
            return text.replace(CAPITALIZE, capitalize);
          case 2:
            return text.toUpperCase();
          default:
            return text;
        }
      };
      CAPITALIZE = /(^|\s|:|-|\(|\))([a-z])/g;
      capitalize = function(m, p1, p2) {
        if (m.length > 0) {
          return p1 + p2.toUpperCase();
        }
        return m;
      };
      ImageElementContainer = /** @class */
      (function(_super) {
        __extends(ImageElementContainer2, _super);
        function ImageElementContainer2(context, img) {
          var _this = _super.call(this, context, img) || this;
          _this.src = img.currentSrc || img.src;
          _this.intrinsicWidth = img.naturalWidth;
          _this.intrinsicHeight = img.naturalHeight;
          _this.context.cache.addImage(_this.src);
          return _this;
        }
        return ImageElementContainer2;
      })(ElementContainer);
      CanvasElementContainer = /** @class */
      (function(_super) {
        __extends(CanvasElementContainer2, _super);
        function CanvasElementContainer2(context, canvas) {
          var _this = _super.call(this, context, canvas) || this;
          _this.canvas = canvas;
          _this.intrinsicWidth = canvas.width;
          _this.intrinsicHeight = canvas.height;
          return _this;
        }
        return CanvasElementContainer2;
      })(ElementContainer);
      SVGElementContainer = /** @class */
      (function(_super) {
        __extends(SVGElementContainer2, _super);
        function SVGElementContainer2(context, img) {
          var _this = _super.call(this, context, img) || this;
          var s = new XMLSerializer();
          var bounds = parseBounds(context, img);
          img.setAttribute("width", bounds.width + "px");
          img.setAttribute("height", bounds.height + "px");
          _this.svg = "data:image/svg+xml," + encodeURIComponent(s.serializeToString(img));
          _this.intrinsicWidth = img.width.baseVal.value;
          _this.intrinsicHeight = img.height.baseVal.value;
          _this.context.cache.addImage(_this.svg);
          return _this;
        }
        return SVGElementContainer2;
      })(ElementContainer);
      LIElementContainer = /** @class */
      (function(_super) {
        __extends(LIElementContainer2, _super);
        function LIElementContainer2(context, element) {
          var _this = _super.call(this, context, element) || this;
          _this.value = element.value;
          return _this;
        }
        return LIElementContainer2;
      })(ElementContainer);
      OLElementContainer = /** @class */
      (function(_super) {
        __extends(OLElementContainer2, _super);
        function OLElementContainer2(context, element) {
          var _this = _super.call(this, context, element) || this;
          _this.start = element.start;
          _this.reversed = typeof element.reversed === "boolean" && element.reversed === true;
          return _this;
        }
        return OLElementContainer2;
      })(ElementContainer);
      CHECKBOX_BORDER_RADIUS = [
        {
          type: 15,
          flags: 0,
          unit: "px",
          number: 3
        }
      ];
      RADIO_BORDER_RADIUS = [
        {
          type: 16,
          flags: 0,
          number: 50
        }
      ];
      reformatInputBounds = function(bounds) {
        if (bounds.width > bounds.height) {
          return new Bounds(bounds.left + (bounds.width - bounds.height) / 2, bounds.top, bounds.height, bounds.height);
        } else if (bounds.width < bounds.height) {
          return new Bounds(bounds.left, bounds.top + (bounds.height - bounds.width) / 2, bounds.width, bounds.width);
        }
        return bounds;
      };
      getInputValue = function(node) {
        var value = node.type === PASSWORD ? new Array(node.value.length + 1).join("\u2022") : node.value;
        return value.length === 0 ? node.placeholder || "" : value;
      };
      CHECKBOX = "checkbox";
      RADIO = "radio";
      PASSWORD = "password";
      INPUT_COLOR = 707406591;
      InputElementContainer = /** @class */
      (function(_super) {
        __extends(InputElementContainer2, _super);
        function InputElementContainer2(context, input) {
          var _this = _super.call(this, context, input) || this;
          _this.type = input.type.toLowerCase();
          _this.checked = input.checked;
          _this.value = getInputValue(input);
          if (_this.type === CHECKBOX || _this.type === RADIO) {
            _this.styles.backgroundColor = 3739148031;
            _this.styles.borderTopColor = _this.styles.borderRightColor = _this.styles.borderBottomColor = _this.styles.borderLeftColor = 2779096575;
            _this.styles.borderTopWidth = _this.styles.borderRightWidth = _this.styles.borderBottomWidth = _this.styles.borderLeftWidth = 1;
            _this.styles.borderTopStyle = _this.styles.borderRightStyle = _this.styles.borderBottomStyle = _this.styles.borderLeftStyle = 1;
            _this.styles.backgroundClip = [
              0
              /* BORDER_BOX */
            ];
            _this.styles.backgroundOrigin = [
              0
              /* BORDER_BOX */
            ];
            _this.bounds = reformatInputBounds(_this.bounds);
          }
          switch (_this.type) {
            case CHECKBOX:
              _this.styles.borderTopRightRadius = _this.styles.borderTopLeftRadius = _this.styles.borderBottomRightRadius = _this.styles.borderBottomLeftRadius = CHECKBOX_BORDER_RADIUS;
              break;
            case RADIO:
              _this.styles.borderTopRightRadius = _this.styles.borderTopLeftRadius = _this.styles.borderBottomRightRadius = _this.styles.borderBottomLeftRadius = RADIO_BORDER_RADIUS;
              break;
          }
          return _this;
        }
        return InputElementContainer2;
      })(ElementContainer);
      SelectElementContainer = /** @class */
      (function(_super) {
        __extends(SelectElementContainer2, _super);
        function SelectElementContainer2(context, element) {
          var _this = _super.call(this, context, element) || this;
          var option = element.options[element.selectedIndex || 0];
          _this.value = option ? option.text || "" : "";
          return _this;
        }
        return SelectElementContainer2;
      })(ElementContainer);
      TextareaElementContainer = /** @class */
      (function(_super) {
        __extends(TextareaElementContainer2, _super);
        function TextareaElementContainer2(context, element) {
          var _this = _super.call(this, context, element) || this;
          _this.value = element.value;
          return _this;
        }
        return TextareaElementContainer2;
      })(ElementContainer);
      IFrameElementContainer = /** @class */
      (function(_super) {
        __extends(IFrameElementContainer2, _super);
        function IFrameElementContainer2(context, iframe) {
          var _this = _super.call(this, context, iframe) || this;
          _this.src = iframe.src;
          _this.width = parseInt(iframe.width, 10) || 0;
          _this.height = parseInt(iframe.height, 10) || 0;
          _this.backgroundColor = _this.styles.backgroundColor;
          try {
            if (iframe.contentWindow && iframe.contentWindow.document && iframe.contentWindow.document.documentElement) {
              _this.tree = parseTree(context, iframe.contentWindow.document.documentElement);
              var documentBackgroundColor = iframe.contentWindow.document.documentElement ? parseColor(context, getComputedStyle(iframe.contentWindow.document.documentElement).backgroundColor) : COLORS.TRANSPARENT;
              var bodyBackgroundColor = iframe.contentWindow.document.body ? parseColor(context, getComputedStyle(iframe.contentWindow.document.body).backgroundColor) : COLORS.TRANSPARENT;
              _this.backgroundColor = isTransparent(documentBackgroundColor) ? isTransparent(bodyBackgroundColor) ? _this.styles.backgroundColor : bodyBackgroundColor : documentBackgroundColor;
            }
          } catch (e2) {
          }
          return _this;
        }
        return IFrameElementContainer2;
      })(ElementContainer);
      LIST_OWNERS = ["OL", "UL", "MENU"];
      parseNodeTree = function(context, node, parent, root) {
        for (var childNode = node.firstChild, nextNode = void 0; childNode; childNode = nextNode) {
          nextNode = childNode.nextSibling;
          if (isTextNode(childNode) && childNode.data.trim().length > 0) {
            parent.textNodes.push(new TextContainer(context, childNode, parent.styles));
          } else if (isElementNode(childNode)) {
            if (isSlotElement(childNode) && childNode.assignedNodes) {
              childNode.assignedNodes().forEach(function(childNode2) {
                return parseNodeTree(context, childNode2, parent, root);
              });
            } else {
              var container = createContainer(context, childNode);
              if (container.styles.isVisible()) {
                if (createsRealStackingContext(childNode, container, root)) {
                  container.flags |= 4;
                } else if (createsStackingContext(container.styles)) {
                  container.flags |= 2;
                }
                if (LIST_OWNERS.indexOf(childNode.tagName) !== -1) {
                  container.flags |= 8;
                }
                parent.elements.push(container);
                childNode.slot;
                if (childNode.shadowRoot) {
                  parseNodeTree(context, childNode.shadowRoot, container, root);
                } else if (!isTextareaElement(childNode) && !isSVGElement(childNode) && !isSelectElement(childNode)) {
                  parseNodeTree(context, childNode, container, root);
                }
              }
            }
          }
        }
      };
      createContainer = function(context, element) {
        if (isImageElement(element)) {
          return new ImageElementContainer(context, element);
        }
        if (isCanvasElement(element)) {
          return new CanvasElementContainer(context, element);
        }
        if (isSVGElement(element)) {
          return new SVGElementContainer(context, element);
        }
        if (isLIElement(element)) {
          return new LIElementContainer(context, element);
        }
        if (isOLElement(element)) {
          return new OLElementContainer(context, element);
        }
        if (isInputElement(element)) {
          return new InputElementContainer(context, element);
        }
        if (isSelectElement(element)) {
          return new SelectElementContainer(context, element);
        }
        if (isTextareaElement(element)) {
          return new TextareaElementContainer(context, element);
        }
        if (isIFrameElement(element)) {
          return new IFrameElementContainer(context, element);
        }
        return new ElementContainer(context, element);
      };
      parseTree = function(context, element) {
        var container = createContainer(context, element);
        container.flags |= 4;
        parseNodeTree(context, element, container, container);
        return container;
      };
      createsRealStackingContext = function(node, container, root) {
        return container.styles.isPositionedWithZIndex() || container.styles.opacity < 1 || container.styles.isTransformed() || isBodyElement(node) && root.styles.isTransparent();
      };
      createsStackingContext = function(styles) {
        return styles.isPositioned() || styles.isFloating();
      };
      isTextNode = function(node) {
        return node.nodeType === Node.TEXT_NODE;
      };
      isElementNode = function(node) {
        return node.nodeType === Node.ELEMENT_NODE;
      };
      isHTMLElementNode = function(node) {
        return isElementNode(node) && typeof node.style !== "undefined" && !isSVGElementNode(node);
      };
      isSVGElementNode = function(element) {
        return typeof element.className === "object";
      };
      isLIElement = function(node) {
        return node.tagName === "LI";
      };
      isOLElement = function(node) {
        return node.tagName === "OL";
      };
      isInputElement = function(node) {
        return node.tagName === "INPUT";
      };
      isHTMLElement = function(node) {
        return node.tagName === "HTML";
      };
      isSVGElement = function(node) {
        return node.tagName === "svg";
      };
      isBodyElement = function(node) {
        return node.tagName === "BODY";
      };
      isCanvasElement = function(node) {
        return node.tagName === "CANVAS";
      };
      isVideoElement = function(node) {
        return node.tagName === "VIDEO";
      };
      isImageElement = function(node) {
        return node.tagName === "IMG";
      };
      isIFrameElement = function(node) {
        return node.tagName === "IFRAME";
      };
      isStyleElement = function(node) {
        return node.tagName === "STYLE";
      };
      isScriptElement = function(node) {
        return node.tagName === "SCRIPT";
      };
      isTextareaElement = function(node) {
        return node.tagName === "TEXTAREA";
      };
      isSelectElement = function(node) {
        return node.tagName === "SELECT";
      };
      isSlotElement = function(node) {
        return node.tagName === "SLOT";
      };
      isCustomElement = function(node) {
        return node.tagName.indexOf("-") > 0;
      };
      CounterState = /** @class */
      (function() {
        function CounterState2() {
          this.counters = {};
        }
        CounterState2.prototype.getCounterValue = function(name) {
          var counter = this.counters[name];
          if (counter && counter.length) {
            return counter[counter.length - 1];
          }
          return 1;
        };
        CounterState2.prototype.getCounterValues = function(name) {
          var counter = this.counters[name];
          return counter ? counter : [];
        };
        CounterState2.prototype.pop = function(counters) {
          var _this = this;
          counters.forEach(function(counter) {
            return _this.counters[counter].pop();
          });
        };
        CounterState2.prototype.parse = function(style) {
          var _this = this;
          var counterIncrement2 = style.counterIncrement;
          var counterReset2 = style.counterReset;
          var canReset = true;
          if (counterIncrement2 !== null) {
            counterIncrement2.forEach(function(entry) {
              var counter = _this.counters[entry.counter];
              if (counter && entry.increment !== 0) {
                canReset = false;
                if (!counter.length) {
                  counter.push(1);
                }
                counter[Math.max(0, counter.length - 1)] += entry.increment;
              }
            });
          }
          var counterNames = [];
          if (canReset) {
            counterReset2.forEach(function(entry) {
              var counter = _this.counters[entry.counter];
              counterNames.push(entry.counter);
              if (!counter) {
                counter = _this.counters[entry.counter] = [];
              }
              counter.push(entry.reset);
            });
          }
          return counterNames;
        };
        return CounterState2;
      })();
      ROMAN_UPPER = {
        integers: [1e3, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1],
        values: ["M", "CM", "D", "CD", "C", "XC", "L", "XL", "X", "IX", "V", "IV", "I"]
      };
      ARMENIAN = {
        integers: [
          9e3,
          8e3,
          7e3,
          6e3,
          5e3,
          4e3,
          3e3,
          2e3,
          1e3,
          900,
          800,
          700,
          600,
          500,
          400,
          300,
          200,
          100,
          90,
          80,
          70,
          60,
          50,
          40,
          30,
          20,
          10,
          9,
          8,
          7,
          6,
          5,
          4,
          3,
          2,
          1
        ],
        values: [
          "\u0554",
          "\u0553",
          "\u0552",
          "\u0551",
          "\u0550",
          "\u054F",
          "\u054E",
          "\u054D",
          "\u054C",
          "\u054B",
          "\u054A",
          "\u0549",
          "\u0548",
          "\u0547",
          "\u0546",
          "\u0545",
          "\u0544",
          "\u0543",
          "\u0542",
          "\u0541",
          "\u0540",
          "\u053F",
          "\u053E",
          "\u053D",
          "\u053C",
          "\u053B",
          "\u053A",
          "\u0539",
          "\u0538",
          "\u0537",
          "\u0536",
          "\u0535",
          "\u0534",
          "\u0533",
          "\u0532",
          "\u0531"
        ]
      };
      HEBREW = {
        integers: [
          1e4,
          9e3,
          8e3,
          7e3,
          6e3,
          5e3,
          4e3,
          3e3,
          2e3,
          1e3,
          400,
          300,
          200,
          100,
          90,
          80,
          70,
          60,
          50,
          40,
          30,
          20,
          19,
          18,
          17,
          16,
          15,
          10,
          9,
          8,
          7,
          6,
          5,
          4,
          3,
          2,
          1
        ],
        values: [
          "\u05D9\u05F3",
          "\u05D8\u05F3",
          "\u05D7\u05F3",
          "\u05D6\u05F3",
          "\u05D5\u05F3",
          "\u05D4\u05F3",
          "\u05D3\u05F3",
          "\u05D2\u05F3",
          "\u05D1\u05F3",
          "\u05D0\u05F3",
          "\u05EA",
          "\u05E9",
          "\u05E8",
          "\u05E7",
          "\u05E6",
          "\u05E4",
          "\u05E2",
          "\u05E1",
          "\u05E0",
          "\u05DE",
          "\u05DC",
          "\u05DB",
          "\u05D9\u05D8",
          "\u05D9\u05D7",
          "\u05D9\u05D6",
          "\u05D8\u05D6",
          "\u05D8\u05D5",
          "\u05D9",
          "\u05D8",
          "\u05D7",
          "\u05D6",
          "\u05D5",
          "\u05D4",
          "\u05D3",
          "\u05D2",
          "\u05D1",
          "\u05D0"
        ]
      };
      GEORGIAN = {
        integers: [
          1e4,
          9e3,
          8e3,
          7e3,
          6e3,
          5e3,
          4e3,
          3e3,
          2e3,
          1e3,
          900,
          800,
          700,
          600,
          500,
          400,
          300,
          200,
          100,
          90,
          80,
          70,
          60,
          50,
          40,
          30,
          20,
          10,
          9,
          8,
          7,
          6,
          5,
          4,
          3,
          2,
          1
        ],
        values: [
          "\u10F5",
          "\u10F0",
          "\u10EF",
          "\u10F4",
          "\u10EE",
          "\u10ED",
          "\u10EC",
          "\u10EB",
          "\u10EA",
          "\u10E9",
          "\u10E8",
          "\u10E7",
          "\u10E6",
          "\u10E5",
          "\u10E4",
          "\u10F3",
          "\u10E2",
          "\u10E1",
          "\u10E0",
          "\u10DF",
          "\u10DE",
          "\u10DD",
          "\u10F2",
          "\u10DC",
          "\u10DB",
          "\u10DA",
          "\u10D9",
          "\u10D8",
          "\u10D7",
          "\u10F1",
          "\u10D6",
          "\u10D5",
          "\u10D4",
          "\u10D3",
          "\u10D2",
          "\u10D1",
          "\u10D0"
        ]
      };
      createAdditiveCounter = function(value, min, max, symbols, fallback, suffix) {
        if (value < min || value > max) {
          return createCounterText(value, fallback, suffix.length > 0);
        }
        return symbols.integers.reduce(function(string, integer, index) {
          while (value >= integer) {
            value -= integer;
            string += symbols.values[index];
          }
          return string;
        }, "") + suffix;
      };
      createCounterStyleWithSymbolResolver = function(value, codePointRangeLength, isNumeric, resolver) {
        var string = "";
        do {
          if (!isNumeric) {
            value--;
          }
          string = resolver(value) + string;
          value /= codePointRangeLength;
        } while (value * codePointRangeLength >= codePointRangeLength);
        return string;
      };
      createCounterStyleFromRange = function(value, codePointRangeStart, codePointRangeEnd, isNumeric, suffix) {
        var codePointRangeLength = codePointRangeEnd - codePointRangeStart + 1;
        return (value < 0 ? "-" : "") + (createCounterStyleWithSymbolResolver(Math.abs(value), codePointRangeLength, isNumeric, function(codePoint) {
          return fromCodePoint$1(Math.floor(codePoint % codePointRangeLength) + codePointRangeStart);
        }) + suffix);
      };
      createCounterStyleFromSymbols = function(value, symbols, suffix) {
        if (suffix === void 0) {
          suffix = ". ";
        }
        var codePointRangeLength = symbols.length;
        return createCounterStyleWithSymbolResolver(Math.abs(value), codePointRangeLength, false, function(codePoint) {
          return symbols[Math.floor(codePoint % codePointRangeLength)];
        }) + suffix;
      };
      CJK_ZEROS = 1 << 0;
      CJK_TEN_COEFFICIENTS = 1 << 1;
      CJK_TEN_HIGH_COEFFICIENTS = 1 << 2;
      CJK_HUNDRED_COEFFICIENTS = 1 << 3;
      createCJKCounter = function(value, numbers, multipliers, negativeSign, suffix, flags) {
        if (value < -9999 || value > 9999) {
          return createCounterText(value, 4, suffix.length > 0);
        }
        var tmp = Math.abs(value);
        var string = suffix;
        if (tmp === 0) {
          return numbers[0] + string;
        }
        for (var digit = 0; tmp > 0 && digit <= 4; digit++) {
          var coefficient = tmp % 10;
          if (coefficient === 0 && contains(flags, CJK_ZEROS) && string !== "") {
            string = numbers[coefficient] + string;
          } else if (coefficient > 1 || coefficient === 1 && digit === 0 || coefficient === 1 && digit === 1 && contains(flags, CJK_TEN_COEFFICIENTS) || coefficient === 1 && digit === 1 && contains(flags, CJK_TEN_HIGH_COEFFICIENTS) && value > 100 || coefficient === 1 && digit > 1 && contains(flags, CJK_HUNDRED_COEFFICIENTS)) {
            string = numbers[coefficient] + (digit > 0 ? multipliers[digit - 1] : "") + string;
          } else if (coefficient === 1 && digit > 0) {
            string = multipliers[digit - 1] + string;
          }
          tmp = Math.floor(tmp / 10);
        }
        return (value < 0 ? negativeSign : "") + string;
      };
      CHINESE_INFORMAL_MULTIPLIERS = "\u5341\u767E\u5343\u842C";
      CHINESE_FORMAL_MULTIPLIERS = "\u62FE\u4F70\u4EDF\u842C";
      JAPANESE_NEGATIVE = "\u30DE\u30A4\u30CA\u30B9";
      KOREAN_NEGATIVE = "\uB9C8\uC774\uB108\uC2A4";
      createCounterText = function(value, type, appendSuffix) {
        var defaultSuffix = appendSuffix ? ". " : "";
        var cjkSuffix = appendSuffix ? "\u3001" : "";
        var koreanSuffix = appendSuffix ? ", " : "";
        var spaceSuffix = appendSuffix ? " " : "";
        switch (type) {
          case 0:
            return "\u2022" + spaceSuffix;
          case 1:
            return "\u25E6" + spaceSuffix;
          case 2:
            return "\u25FE" + spaceSuffix;
          case 5:
            var string = createCounterStyleFromRange(value, 48, 57, true, defaultSuffix);
            return string.length < 4 ? "0" + string : string;
          case 4:
            return createCounterStyleFromSymbols(value, "\u3007\u4E00\u4E8C\u4E09\u56DB\u4E94\u516D\u4E03\u516B\u4E5D", cjkSuffix);
          case 6:
            return createAdditiveCounter(value, 1, 3999, ROMAN_UPPER, 3, defaultSuffix).toLowerCase();
          case 7:
            return createAdditiveCounter(value, 1, 3999, ROMAN_UPPER, 3, defaultSuffix);
          case 8:
            return createCounterStyleFromRange(value, 945, 969, false, defaultSuffix);
          case 9:
            return createCounterStyleFromRange(value, 97, 122, false, defaultSuffix);
          case 10:
            return createCounterStyleFromRange(value, 65, 90, false, defaultSuffix);
          case 11:
            return createCounterStyleFromRange(value, 1632, 1641, true, defaultSuffix);
          case 12:
          case 49:
            return createAdditiveCounter(value, 1, 9999, ARMENIAN, 3, defaultSuffix);
          case 35:
            return createAdditiveCounter(value, 1, 9999, ARMENIAN, 3, defaultSuffix).toLowerCase();
          case 13:
            return createCounterStyleFromRange(value, 2534, 2543, true, defaultSuffix);
          case 14:
          case 30:
            return createCounterStyleFromRange(value, 6112, 6121, true, defaultSuffix);
          case 15:
            return createCounterStyleFromSymbols(value, "\u5B50\u4E11\u5BC5\u536F\u8FB0\u5DF3\u5348\u672A\u7533\u9149\u620C\u4EA5", cjkSuffix);
          case 16:
            return createCounterStyleFromSymbols(value, "\u7532\u4E59\u4E19\u4E01\u620A\u5DF1\u5E9A\u8F9B\u58EC\u7678", cjkSuffix);
          case 17:
          case 48:
            return createCJKCounter(value, "\u96F6\u4E00\u4E8C\u4E09\u56DB\u4E94\u516D\u4E03\u516B\u4E5D", CHINESE_INFORMAL_MULTIPLIERS, "\u8CA0", cjkSuffix, CJK_TEN_COEFFICIENTS | CJK_TEN_HIGH_COEFFICIENTS | CJK_HUNDRED_COEFFICIENTS);
          case 47:
            return createCJKCounter(value, "\u96F6\u58F9\u8CB3\u53C3\u8086\u4F0D\u9678\u67D2\u634C\u7396", CHINESE_FORMAL_MULTIPLIERS, "\u8CA0", cjkSuffix, CJK_ZEROS | CJK_TEN_COEFFICIENTS | CJK_TEN_HIGH_COEFFICIENTS | CJK_HUNDRED_COEFFICIENTS);
          case 42:
            return createCJKCounter(value, "\u96F6\u4E00\u4E8C\u4E09\u56DB\u4E94\u516D\u4E03\u516B\u4E5D", CHINESE_INFORMAL_MULTIPLIERS, "\u8D1F", cjkSuffix, CJK_TEN_COEFFICIENTS | CJK_TEN_HIGH_COEFFICIENTS | CJK_HUNDRED_COEFFICIENTS);
          case 41:
            return createCJKCounter(value, "\u96F6\u58F9\u8D30\u53C1\u8086\u4F0D\u9646\u67D2\u634C\u7396", CHINESE_FORMAL_MULTIPLIERS, "\u8D1F", cjkSuffix, CJK_ZEROS | CJK_TEN_COEFFICIENTS | CJK_TEN_HIGH_COEFFICIENTS | CJK_HUNDRED_COEFFICIENTS);
          case 26:
            return createCJKCounter(value, "\u3007\u4E00\u4E8C\u4E09\u56DB\u4E94\u516D\u4E03\u516B\u4E5D", "\u5341\u767E\u5343\u4E07", JAPANESE_NEGATIVE, cjkSuffix, 0);
          case 25:
            return createCJKCounter(value, "\u96F6\u58F1\u5F10\u53C2\u56DB\u4F0D\u516D\u4E03\u516B\u4E5D", "\u62FE\u767E\u5343\u4E07", JAPANESE_NEGATIVE, cjkSuffix, CJK_ZEROS | CJK_TEN_COEFFICIENTS | CJK_TEN_HIGH_COEFFICIENTS);
          case 31:
            return createCJKCounter(value, "\uC601\uC77C\uC774\uC0BC\uC0AC\uC624\uC721\uCE60\uD314\uAD6C", "\uC2ED\uBC31\uCC9C\uB9CC", KOREAN_NEGATIVE, koreanSuffix, CJK_ZEROS | CJK_TEN_COEFFICIENTS | CJK_TEN_HIGH_COEFFICIENTS);
          case 33:
            return createCJKCounter(value, "\u96F6\u4E00\u4E8C\u4E09\u56DB\u4E94\u516D\u4E03\u516B\u4E5D", "\u5341\u767E\u5343\u842C", KOREAN_NEGATIVE, koreanSuffix, 0);
          case 32:
            return createCJKCounter(value, "\u96F6\u58F9\u8CB3\u53C3\u56DB\u4E94\u516D\u4E03\u516B\u4E5D", "\u62FE\u767E\u5343", KOREAN_NEGATIVE, koreanSuffix, CJK_ZEROS | CJK_TEN_COEFFICIENTS | CJK_TEN_HIGH_COEFFICIENTS);
          case 18:
            return createCounterStyleFromRange(value, 2406, 2415, true, defaultSuffix);
          case 20:
            return createAdditiveCounter(value, 1, 19999, GEORGIAN, 3, defaultSuffix);
          case 21:
            return createCounterStyleFromRange(value, 2790, 2799, true, defaultSuffix);
          case 22:
            return createCounterStyleFromRange(value, 2662, 2671, true, defaultSuffix);
          case 22:
            return createAdditiveCounter(value, 1, 10999, HEBREW, 3, defaultSuffix);
          case 23:
            return createCounterStyleFromSymbols(value, "\u3042\u3044\u3046\u3048\u304A\u304B\u304D\u304F\u3051\u3053\u3055\u3057\u3059\u305B\u305D\u305F\u3061\u3064\u3066\u3068\u306A\u306B\u306C\u306D\u306E\u306F\u3072\u3075\u3078\u307B\u307E\u307F\u3080\u3081\u3082\u3084\u3086\u3088\u3089\u308A\u308B\u308C\u308D\u308F\u3090\u3091\u3092\u3093");
          case 24:
            return createCounterStyleFromSymbols(value, "\u3044\u308D\u306F\u306B\u307B\u3078\u3068\u3061\u308A\u306C\u308B\u3092\u308F\u304B\u3088\u305F\u308C\u305D\u3064\u306D\u306A\u3089\u3080\u3046\u3090\u306E\u304A\u304F\u3084\u307E\u3051\u3075\u3053\u3048\u3066\u3042\u3055\u304D\u3086\u3081\u307F\u3057\u3091\u3072\u3082\u305B\u3059");
          case 27:
            return createCounterStyleFromRange(value, 3302, 3311, true, defaultSuffix);
          case 28:
            return createCounterStyleFromSymbols(value, "\u30A2\u30A4\u30A6\u30A8\u30AA\u30AB\u30AD\u30AF\u30B1\u30B3\u30B5\u30B7\u30B9\u30BB\u30BD\u30BF\u30C1\u30C4\u30C6\u30C8\u30CA\u30CB\u30CC\u30CD\u30CE\u30CF\u30D2\u30D5\u30D8\u30DB\u30DE\u30DF\u30E0\u30E1\u30E2\u30E4\u30E6\u30E8\u30E9\u30EA\u30EB\u30EC\u30ED\u30EF\u30F0\u30F1\u30F2\u30F3", cjkSuffix);
          case 29:
            return createCounterStyleFromSymbols(value, "\u30A4\u30ED\u30CF\u30CB\u30DB\u30D8\u30C8\u30C1\u30EA\u30CC\u30EB\u30F2\u30EF\u30AB\u30E8\u30BF\u30EC\u30BD\u30C4\u30CD\u30CA\u30E9\u30E0\u30A6\u30F0\u30CE\u30AA\u30AF\u30E4\u30DE\u30B1\u30D5\u30B3\u30A8\u30C6\u30A2\u30B5\u30AD\u30E6\u30E1\u30DF\u30B7\u30F1\u30D2\u30E2\u30BB\u30B9", cjkSuffix);
          case 34:
            return createCounterStyleFromRange(value, 3792, 3801, true, defaultSuffix);
          case 37:
            return createCounterStyleFromRange(value, 6160, 6169, true, defaultSuffix);
          case 38:
            return createCounterStyleFromRange(value, 4160, 4169, true, defaultSuffix);
          case 39:
            return createCounterStyleFromRange(value, 2918, 2927, true, defaultSuffix);
          case 40:
            return createCounterStyleFromRange(value, 1776, 1785, true, defaultSuffix);
          case 43:
            return createCounterStyleFromRange(value, 3046, 3055, true, defaultSuffix);
          case 44:
            return createCounterStyleFromRange(value, 3174, 3183, true, defaultSuffix);
          case 45:
            return createCounterStyleFromRange(value, 3664, 3673, true, defaultSuffix);
          case 46:
            return createCounterStyleFromRange(value, 3872, 3881, true, defaultSuffix);
          case 3:
          default:
            return createCounterStyleFromRange(value, 48, 57, true, defaultSuffix);
        }
      };
      IGNORE_ATTRIBUTE = "data-html2canvas-ignore";
      DocumentCloner = /** @class */
      (function() {
        function DocumentCloner2(context, element, options) {
          this.context = context;
          this.options = options;
          this.scrolledElements = [];
          this.referenceElement = element;
          this.counters = new CounterState();
          this.quoteDepth = 0;
          if (!element.ownerDocument) {
            throw new Error("Cloned element does not have an owner document");
          }
          this.documentElement = this.cloneNode(element.ownerDocument.documentElement, false);
        }
        DocumentCloner2.prototype.toIFrame = function(ownerDocument, windowSize) {
          var _this = this;
          var iframe = createIFrameContainer(ownerDocument, windowSize);
          if (!iframe.contentWindow) {
            return Promise.reject("Unable to find iframe window");
          }
          var scrollX = ownerDocument.defaultView.pageXOffset;
          var scrollY = ownerDocument.defaultView.pageYOffset;
          var cloneWindow = iframe.contentWindow;
          var documentClone = cloneWindow.document;
          var iframeLoad = iframeLoader(iframe).then(function() {
            return __awaiter(_this, void 0, void 0, function() {
              var onclone, referenceElement;
              return __generator(this, function(_a) {
                switch (_a.label) {
                  case 0:
                    this.scrolledElements.forEach(restoreNodeScroll);
                    if (cloneWindow) {
                      cloneWindow.scrollTo(windowSize.left, windowSize.top);
                      if (/(iPad|iPhone|iPod)/g.test(navigator.userAgent) && (cloneWindow.scrollY !== windowSize.top || cloneWindow.scrollX !== windowSize.left)) {
                        this.context.logger.warn("Unable to restore scroll position for cloned document");
                        this.context.windowBounds = this.context.windowBounds.add(cloneWindow.scrollX - windowSize.left, cloneWindow.scrollY - windowSize.top, 0, 0);
                      }
                    }
                    onclone = this.options.onclone;
                    referenceElement = this.clonedReferenceElement;
                    if (typeof referenceElement === "undefined") {
                      return [2, Promise.reject("Error finding the " + this.referenceElement.nodeName + " in the cloned document")];
                    }
                    if (!(documentClone.fonts && documentClone.fonts.ready)) return [3, 2];
                    return [4, documentClone.fonts.ready];
                  case 1:
                    _a.sent();
                    _a.label = 2;
                  case 2:
                    if (!/(AppleWebKit)/g.test(navigator.userAgent)) return [3, 4];
                    return [4, imagesReady(documentClone)];
                  case 3:
                    _a.sent();
                    _a.label = 4;
                  case 4:
                    if (typeof onclone === "function") {
                      return [2, Promise.resolve().then(function() {
                        return onclone(documentClone, referenceElement);
                      }).then(function() {
                        return iframe;
                      })];
                    }
                    return [2, iframe];
                }
              });
            });
          });
          documentClone.open();
          documentClone.write(serializeDoctype(document.doctype) + "<html></html>");
          restoreOwnerScroll(this.referenceElement.ownerDocument, scrollX, scrollY);
          documentClone.replaceChild(documentClone.adoptNode(this.documentElement), documentClone.documentElement);
          documentClone.close();
          return iframeLoad;
        };
        DocumentCloner2.prototype.createElementClone = function(node) {
          if (isDebugging(
            node,
            2
            /* CLONE */
          )) {
            debugger;
          }
          if (isCanvasElement(node)) {
            return this.createCanvasClone(node);
          }
          if (isVideoElement(node)) {
            return this.createVideoClone(node);
          }
          if (isStyleElement(node)) {
            return this.createStyleClone(node);
          }
          var clone = node.cloneNode(false);
          if (isImageElement(clone)) {
            if (isImageElement(node) && node.currentSrc && node.currentSrc !== node.src) {
              clone.src = node.currentSrc;
              clone.srcset = "";
            }
            if (clone.loading === "lazy") {
              clone.loading = "eager";
            }
          }
          if (isCustomElement(clone)) {
            return this.createCustomElementClone(clone);
          }
          return clone;
        };
        DocumentCloner2.prototype.createCustomElementClone = function(node) {
          var clone = document.createElement("html2canvascustomelement");
          copyCSSStyles(node.style, clone);
          return clone;
        };
        DocumentCloner2.prototype.createStyleClone = function(node) {
          try {
            var sheet = node.sheet;
            if (sheet && sheet.cssRules) {
              var css = [].slice.call(sheet.cssRules, 0).reduce(function(css2, rule) {
                if (rule && typeof rule.cssText === "string") {
                  return css2 + rule.cssText;
                }
                return css2;
              }, "");
              var style = node.cloneNode(false);
              style.textContent = css;
              return style;
            }
          } catch (e2) {
            this.context.logger.error("Unable to access cssRules property", e2);
            if (e2.name !== "SecurityError") {
              throw e2;
            }
          }
          return node.cloneNode(false);
        };
        DocumentCloner2.prototype.createCanvasClone = function(canvas) {
          var _a;
          if (this.options.inlineImages && canvas.ownerDocument) {
            var img = canvas.ownerDocument.createElement("img");
            try {
              img.src = canvas.toDataURL();
              return img;
            } catch (e2) {
              this.context.logger.info("Unable to inline canvas contents, canvas is tainted", canvas);
            }
          }
          var clonedCanvas = canvas.cloneNode(false);
          try {
            clonedCanvas.width = canvas.width;
            clonedCanvas.height = canvas.height;
            var ctx = canvas.getContext("2d");
            var clonedCtx = clonedCanvas.getContext("2d");
            if (clonedCtx) {
              if (!this.options.allowTaint && ctx) {
                clonedCtx.putImageData(ctx.getImageData(0, 0, canvas.width, canvas.height), 0, 0);
              } else {
                var gl = (_a = canvas.getContext("webgl2")) !== null && _a !== void 0 ? _a : canvas.getContext("webgl");
                if (gl) {
                  var attribs = gl.getContextAttributes();
                  if ((attribs === null || attribs === void 0 ? void 0 : attribs.preserveDrawingBuffer) === false) {
                    this.context.logger.warn("Unable to clone WebGL context as it has preserveDrawingBuffer=false", canvas);
                  }
                }
                clonedCtx.drawImage(canvas, 0, 0);
              }
            }
            return clonedCanvas;
          } catch (e2) {
            this.context.logger.info("Unable to clone canvas as it is tainted", canvas);
          }
          return clonedCanvas;
        };
        DocumentCloner2.prototype.createVideoClone = function(video) {
          var canvas = video.ownerDocument.createElement("canvas");
          canvas.width = video.offsetWidth;
          canvas.height = video.offsetHeight;
          var ctx = canvas.getContext("2d");
          try {
            if (ctx) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              if (!this.options.allowTaint) {
                ctx.getImageData(0, 0, canvas.width, canvas.height);
              }
            }
            return canvas;
          } catch (e2) {
            this.context.logger.info("Unable to clone video as it is tainted", video);
          }
          var blankCanvas = video.ownerDocument.createElement("canvas");
          blankCanvas.width = video.offsetWidth;
          blankCanvas.height = video.offsetHeight;
          return blankCanvas;
        };
        DocumentCloner2.prototype.appendChildNode = function(clone, child, copyStyles) {
          if (!isElementNode(child) || !isScriptElement(child) && !child.hasAttribute(IGNORE_ATTRIBUTE) && (typeof this.options.ignoreElements !== "function" || !this.options.ignoreElements(child))) {
            if (!this.options.copyStyles || !isElementNode(child) || !isStyleElement(child)) {
              clone.appendChild(this.cloneNode(child, copyStyles));
            }
          }
        };
        DocumentCloner2.prototype.cloneChildNodes = function(node, clone, copyStyles) {
          var _this = this;
          for (var child = node.shadowRoot ? node.shadowRoot.firstChild : node.firstChild; child; child = child.nextSibling) {
            if (isElementNode(child) && isSlotElement(child) && typeof child.assignedNodes === "function") {
              var assignedNodes = child.assignedNodes();
              if (assignedNodes.length) {
                assignedNodes.forEach(function(assignedNode) {
                  return _this.appendChildNode(clone, assignedNode, copyStyles);
                });
              }
            } else {
              this.appendChildNode(clone, child, copyStyles);
            }
          }
        };
        DocumentCloner2.prototype.cloneNode = function(node, copyStyles) {
          if (isTextNode(node)) {
            return document.createTextNode(node.data);
          }
          if (!node.ownerDocument) {
            return node.cloneNode(false);
          }
          var window2 = node.ownerDocument.defaultView;
          if (window2 && isElementNode(node) && (isHTMLElementNode(node) || isSVGElementNode(node))) {
            var clone = this.createElementClone(node);
            clone.style.transitionProperty = "none";
            var style = window2.getComputedStyle(node);
            var styleBefore = window2.getComputedStyle(node, ":before");
            var styleAfter = window2.getComputedStyle(node, ":after");
            if (this.referenceElement === node && isHTMLElementNode(clone)) {
              this.clonedReferenceElement = clone;
            }
            if (isBodyElement(clone)) {
              createPseudoHideStyles(clone);
            }
            var counters = this.counters.parse(new CSSParsedCounterDeclaration(this.context, style));
            var before = this.resolvePseudoContent(node, clone, styleBefore, PseudoElementType.BEFORE);
            if (isCustomElement(node)) {
              copyStyles = true;
            }
            if (!isVideoElement(node)) {
              this.cloneChildNodes(node, clone, copyStyles);
            }
            if (before) {
              clone.insertBefore(before, clone.firstChild);
            }
            var after = this.resolvePseudoContent(node, clone, styleAfter, PseudoElementType.AFTER);
            if (after) {
              clone.appendChild(after);
            }
            this.counters.pop(counters);
            if (style && (this.options.copyStyles || isSVGElementNode(node)) && !isIFrameElement(node) || copyStyles) {
              copyCSSStyles(style, clone);
            }
            if (node.scrollTop !== 0 || node.scrollLeft !== 0) {
              this.scrolledElements.push([clone, node.scrollLeft, node.scrollTop]);
            }
            if ((isTextareaElement(node) || isSelectElement(node)) && (isTextareaElement(clone) || isSelectElement(clone))) {
              clone.value = node.value;
            }
            return clone;
          }
          return node.cloneNode(false);
        };
        DocumentCloner2.prototype.resolvePseudoContent = function(node, clone, style, pseudoElt) {
          var _this = this;
          if (!style) {
            return;
          }
          var value = style.content;
          var document2 = clone.ownerDocument;
          if (!document2 || !value || value === "none" || value === "-moz-alt-content" || style.display === "none") {
            return;
          }
          this.counters.parse(new CSSParsedCounterDeclaration(this.context, style));
          var declaration = new CSSParsedPseudoDeclaration(this.context, style);
          var anonymousReplacedElement = document2.createElement("html2canvaspseudoelement");
          copyCSSStyles(style, anonymousReplacedElement);
          declaration.content.forEach(function(token) {
            if (token.type === 0) {
              anonymousReplacedElement.appendChild(document2.createTextNode(token.value));
            } else if (token.type === 22) {
              var img = document2.createElement("img");
              img.src = token.value;
              img.style.opacity = "1";
              anonymousReplacedElement.appendChild(img);
            } else if (token.type === 18) {
              if (token.name === "attr") {
                var attr = token.values.filter(isIdentToken);
                if (attr.length) {
                  anonymousReplacedElement.appendChild(document2.createTextNode(node.getAttribute(attr[0].value) || ""));
                }
              } else if (token.name === "counter") {
                var _a = token.values.filter(nonFunctionArgSeparator), counter = _a[0], counterStyle = _a[1];
                if (counter && isIdentToken(counter)) {
                  var counterState = _this.counters.getCounterValue(counter.value);
                  var counterType = counterStyle && isIdentToken(counterStyle) ? listStyleType.parse(_this.context, counterStyle.value) : 3;
                  anonymousReplacedElement.appendChild(document2.createTextNode(createCounterText(counterState, counterType, false)));
                }
              } else if (token.name === "counters") {
                var _b = token.values.filter(nonFunctionArgSeparator), counter = _b[0], delim = _b[1], counterStyle = _b[2];
                if (counter && isIdentToken(counter)) {
                  var counterStates = _this.counters.getCounterValues(counter.value);
                  var counterType_1 = counterStyle && isIdentToken(counterStyle) ? listStyleType.parse(_this.context, counterStyle.value) : 3;
                  var separator = delim && delim.type === 0 ? delim.value : "";
                  var text = counterStates.map(function(value2) {
                    return createCounterText(value2, counterType_1, false);
                  }).join(separator);
                  anonymousReplacedElement.appendChild(document2.createTextNode(text));
                }
              } else ;
            } else if (token.type === 20) {
              switch (token.value) {
                case "open-quote":
                  anonymousReplacedElement.appendChild(document2.createTextNode(getQuote(declaration.quotes, _this.quoteDepth++, true)));
                  break;
                case "close-quote":
                  anonymousReplacedElement.appendChild(document2.createTextNode(getQuote(declaration.quotes, --_this.quoteDepth, false)));
                  break;
                default:
                  anonymousReplacedElement.appendChild(document2.createTextNode(token.value));
              }
            }
          });
          anonymousReplacedElement.className = PSEUDO_HIDE_ELEMENT_CLASS_BEFORE + " " + PSEUDO_HIDE_ELEMENT_CLASS_AFTER;
          var newClassName = pseudoElt === PseudoElementType.BEFORE ? " " + PSEUDO_HIDE_ELEMENT_CLASS_BEFORE : " " + PSEUDO_HIDE_ELEMENT_CLASS_AFTER;
          if (isSVGElementNode(clone)) {
            clone.className.baseValue += newClassName;
          } else {
            clone.className += newClassName;
          }
          return anonymousReplacedElement;
        };
        DocumentCloner2.destroy = function(container) {
          if (container.parentNode) {
            container.parentNode.removeChild(container);
            return true;
          }
          return false;
        };
        return DocumentCloner2;
      })();
      (function(PseudoElementType2) {
        PseudoElementType2[PseudoElementType2["BEFORE"] = 0] = "BEFORE";
        PseudoElementType2[PseudoElementType2["AFTER"] = 1] = "AFTER";
      })(PseudoElementType || (PseudoElementType = {}));
      createIFrameContainer = function(ownerDocument, bounds) {
        var cloneIframeContainer = ownerDocument.createElement("iframe");
        cloneIframeContainer.className = "html2canvas-container";
        cloneIframeContainer.style.visibility = "hidden";
        cloneIframeContainer.style.position = "fixed";
        cloneIframeContainer.style.left = "-10000px";
        cloneIframeContainer.style.top = "0px";
        cloneIframeContainer.style.border = "0";
        cloneIframeContainer.width = bounds.width.toString();
        cloneIframeContainer.height = bounds.height.toString();
        cloneIframeContainer.scrolling = "no";
        cloneIframeContainer.setAttribute(IGNORE_ATTRIBUTE, "true");
        ownerDocument.body.appendChild(cloneIframeContainer);
        return cloneIframeContainer;
      };
      imageReady = function(img) {
        return new Promise(function(resolve) {
          if (img.complete) {
            resolve();
            return;
          }
          if (!img.src) {
            resolve();
            return;
          }
          img.onload = resolve;
          img.onerror = resolve;
        });
      };
      imagesReady = function(document2) {
        return Promise.all([].slice.call(document2.images, 0).map(imageReady));
      };
      iframeLoader = function(iframe) {
        return new Promise(function(resolve, reject) {
          var cloneWindow = iframe.contentWindow;
          if (!cloneWindow) {
            return reject("No window assigned for iframe");
          }
          var documentClone = cloneWindow.document;
          cloneWindow.onload = iframe.onload = function() {
            cloneWindow.onload = iframe.onload = null;
            var interval = setInterval(function() {
              if (documentClone.body.childNodes.length > 0 && documentClone.readyState === "complete") {
                clearInterval(interval);
                resolve(iframe);
              }
            }, 50);
          };
        });
      };
      ignoredStyleProperties = [
        "all",
        "d",
        "content"
        // Safari shows pseudoelements if content is set
      ];
      copyCSSStyles = function(style, target) {
        for (var i = style.length - 1; i >= 0; i--) {
          var property = style.item(i);
          if (ignoredStyleProperties.indexOf(property) === -1) {
            target.style.setProperty(property, style.getPropertyValue(property));
          }
        }
        return target;
      };
      serializeDoctype = function(doctype) {
        var str = "";
        if (doctype) {
          str += "<!DOCTYPE ";
          if (doctype.name) {
            str += doctype.name;
          }
          if (doctype.internalSubset) {
            str += doctype.internalSubset;
          }
          if (doctype.publicId) {
            str += '"' + doctype.publicId + '"';
          }
          if (doctype.systemId) {
            str += '"' + doctype.systemId + '"';
          }
          str += ">";
        }
        return str;
      };
      restoreOwnerScroll = function(ownerDocument, x, y) {
        if (ownerDocument && ownerDocument.defaultView && (x !== ownerDocument.defaultView.pageXOffset || y !== ownerDocument.defaultView.pageYOffset)) {
          ownerDocument.defaultView.scrollTo(x, y);
        }
      };
      restoreNodeScroll = function(_a) {
        var element = _a[0], x = _a[1], y = _a[2];
        element.scrollLeft = x;
        element.scrollTop = y;
      };
      PSEUDO_BEFORE = ":before";
      PSEUDO_AFTER = ":after";
      PSEUDO_HIDE_ELEMENT_CLASS_BEFORE = "___html2canvas___pseudoelement_before";
      PSEUDO_HIDE_ELEMENT_CLASS_AFTER = "___html2canvas___pseudoelement_after";
      PSEUDO_HIDE_ELEMENT_STYLE = '{\n    content: "" !important;\n    display: none !important;\n}';
      createPseudoHideStyles = function(body) {
        createStyles(body, "." + PSEUDO_HIDE_ELEMENT_CLASS_BEFORE + PSEUDO_BEFORE + PSEUDO_HIDE_ELEMENT_STYLE + "\n         ." + PSEUDO_HIDE_ELEMENT_CLASS_AFTER + PSEUDO_AFTER + PSEUDO_HIDE_ELEMENT_STYLE);
      };
      createStyles = function(body, styles) {
        var document2 = body.ownerDocument;
        if (document2) {
          var style = document2.createElement("style");
          style.textContent = styles;
          body.appendChild(style);
        }
      };
      CacheStorage = /** @class */
      (function() {
        function CacheStorage2() {
        }
        CacheStorage2.getOrigin = function(url) {
          var link = CacheStorage2._link;
          if (!link) {
            return "about:blank";
          }
          link.href = url;
          link.href = link.href;
          return link.protocol + link.hostname + link.port;
        };
        CacheStorage2.isSameOrigin = function(src) {
          return CacheStorage2.getOrigin(src) === CacheStorage2._origin;
        };
        CacheStorage2.setContext = function(window2) {
          CacheStorage2._link = window2.document.createElement("a");
          CacheStorage2._origin = CacheStorage2.getOrigin(window2.location.href);
        };
        CacheStorage2._origin = "about:blank";
        return CacheStorage2;
      })();
      Cache = /** @class */
      (function() {
        function Cache2(context, _options) {
          this.context = context;
          this._options = _options;
          this._cache = {};
        }
        Cache2.prototype.addImage = function(src) {
          var result = Promise.resolve();
          if (this.has(src)) {
            return result;
          }
          if (isBlobImage(src) || isRenderable(src)) {
            (this._cache[src] = this.loadImage(src)).catch(function() {
            });
            return result;
          }
          return result;
        };
        Cache2.prototype.match = function(src) {
          return this._cache[src];
        };
        Cache2.prototype.loadImage = function(key) {
          return __awaiter(this, void 0, void 0, function() {
            var isSameOrigin, useCORS, useProxy, src;
            var _this = this;
            return __generator(this, function(_a) {
              switch (_a.label) {
                case 0:
                  isSameOrigin = CacheStorage.isSameOrigin(key);
                  useCORS = !isInlineImage(key) && this._options.useCORS === true && FEATURES.SUPPORT_CORS_IMAGES && !isSameOrigin;
                  useProxy = !isInlineImage(key) && !isSameOrigin && !isBlobImage(key) && typeof this._options.proxy === "string" && FEATURES.SUPPORT_CORS_XHR && !useCORS;
                  if (!isSameOrigin && this._options.allowTaint === false && !isInlineImage(key) && !isBlobImage(key) && !useProxy && !useCORS) {
                    return [
                      2
                      /*return*/
                    ];
                  }
                  src = key;
                  if (!useProxy) return [3, 2];
                  return [4, this.proxy(src)];
                case 1:
                  src = _a.sent();
                  _a.label = 2;
                case 2:
                  this.context.logger.debug("Added image " + key.substring(0, 256));
                  return [4, new Promise(function(resolve, reject) {
                    var img = new Image();
                    img.onload = function() {
                      return resolve(img);
                    };
                    img.onerror = reject;
                    if (isInlineBase64Image(src) || useCORS) {
                      img.crossOrigin = "anonymous";
                    }
                    img.src = src;
                    if (img.complete === true) {
                      setTimeout(function() {
                        return resolve(img);
                      }, 500);
                    }
                    if (_this._options.imageTimeout > 0) {
                      setTimeout(function() {
                        return reject("Timed out (" + _this._options.imageTimeout + "ms) loading image");
                      }, _this._options.imageTimeout);
                    }
                  })];
                case 3:
                  return [2, _a.sent()];
              }
            });
          });
        };
        Cache2.prototype.has = function(key) {
          return typeof this._cache[key] !== "undefined";
        };
        Cache2.prototype.keys = function() {
          return Promise.resolve(Object.keys(this._cache));
        };
        Cache2.prototype.proxy = function(src) {
          var _this = this;
          var proxy = this._options.proxy;
          if (!proxy) {
            throw new Error("No proxy defined");
          }
          var key = src.substring(0, 256);
          return new Promise(function(resolve, reject) {
            var responseType = FEATURES.SUPPORT_RESPONSE_TYPE ? "blob" : "text";
            var xhr = new XMLHttpRequest();
            xhr.onload = function() {
              if (xhr.status === 200) {
                if (responseType === "text") {
                  resolve(xhr.response);
                } else {
                  var reader_1 = new FileReader();
                  reader_1.addEventListener("load", function() {
                    return resolve(reader_1.result);
                  }, false);
                  reader_1.addEventListener("error", function(e2) {
                    return reject(e2);
                  }, false);
                  reader_1.readAsDataURL(xhr.response);
                }
              } else {
                reject("Failed to proxy resource " + key + " with status code " + xhr.status);
              }
            };
            xhr.onerror = reject;
            var queryString = proxy.indexOf("?") > -1 ? "&" : "?";
            xhr.open("GET", "" + proxy + queryString + "url=" + encodeURIComponent(src) + "&responseType=" + responseType);
            if (responseType !== "text" && xhr instanceof XMLHttpRequest) {
              xhr.responseType = responseType;
            }
            if (_this._options.imageTimeout) {
              var timeout_1 = _this._options.imageTimeout;
              xhr.timeout = timeout_1;
              xhr.ontimeout = function() {
                return reject("Timed out (" + timeout_1 + "ms) proxying " + key);
              };
            }
            xhr.send();
          });
        };
        return Cache2;
      })();
      INLINE_SVG = /^data:image\/svg\+xml/i;
      INLINE_BASE64 = /^data:image\/.*;base64,/i;
      INLINE_IMG = /^data:image\/.*/i;
      isRenderable = function(src) {
        return FEATURES.SUPPORT_SVG_DRAWING || !isSVG(src);
      };
      isInlineImage = function(src) {
        return INLINE_IMG.test(src);
      };
      isInlineBase64Image = function(src) {
        return INLINE_BASE64.test(src);
      };
      isBlobImage = function(src) {
        return src.substr(0, 4) === "blob";
      };
      isSVG = function(src) {
        return src.substr(-3).toLowerCase() === "svg" || INLINE_SVG.test(src);
      };
      Vector = /** @class */
      (function() {
        function Vector2(x, y) {
          this.type = 0;
          this.x = x;
          this.y = y;
        }
        Vector2.prototype.add = function(deltaX, deltaY) {
          return new Vector2(this.x + deltaX, this.y + deltaY);
        };
        return Vector2;
      })();
      lerp = function(a2, b, t) {
        return new Vector(a2.x + (b.x - a2.x) * t, a2.y + (b.y - a2.y) * t);
      };
      BezierCurve = /** @class */
      (function() {
        function BezierCurve2(start, startControl, endControl, end) {
          this.type = 1;
          this.start = start;
          this.startControl = startControl;
          this.endControl = endControl;
          this.end = end;
        }
        BezierCurve2.prototype.subdivide = function(t, firstHalf) {
          var ab = lerp(this.start, this.startControl, t);
          var bc = lerp(this.startControl, this.endControl, t);
          var cd = lerp(this.endControl, this.end, t);
          var abbc = lerp(ab, bc, t);
          var bccd = lerp(bc, cd, t);
          var dest = lerp(abbc, bccd, t);
          return firstHalf ? new BezierCurve2(this.start, ab, abbc, dest) : new BezierCurve2(dest, bccd, cd, this.end);
        };
        BezierCurve2.prototype.add = function(deltaX, deltaY) {
          return new BezierCurve2(this.start.add(deltaX, deltaY), this.startControl.add(deltaX, deltaY), this.endControl.add(deltaX, deltaY), this.end.add(deltaX, deltaY));
        };
        BezierCurve2.prototype.reverse = function() {
          return new BezierCurve2(this.end, this.endControl, this.startControl, this.start);
        };
        return BezierCurve2;
      })();
      isBezierCurve = function(path) {
        return path.type === 1;
      };
      BoundCurves = /** @class */
      /* @__PURE__ */ (function() {
        function BoundCurves2(element) {
          var styles = element.styles;
          var bounds = element.bounds;
          var _a = getAbsoluteValueForTuple(styles.borderTopLeftRadius, bounds.width, bounds.height), tlh = _a[0], tlv = _a[1];
          var _b = getAbsoluteValueForTuple(styles.borderTopRightRadius, bounds.width, bounds.height), trh = _b[0], trv = _b[1];
          var _c = getAbsoluteValueForTuple(styles.borderBottomRightRadius, bounds.width, bounds.height), brh = _c[0], brv = _c[1];
          var _d = getAbsoluteValueForTuple(styles.borderBottomLeftRadius, bounds.width, bounds.height), blh = _d[0], blv = _d[1];
          var factors = [];
          factors.push((tlh + trh) / bounds.width);
          factors.push((blh + brh) / bounds.width);
          factors.push((tlv + blv) / bounds.height);
          factors.push((trv + brv) / bounds.height);
          var maxFactor = Math.max.apply(Math, factors);
          if (maxFactor > 1) {
            tlh /= maxFactor;
            tlv /= maxFactor;
            trh /= maxFactor;
            trv /= maxFactor;
            brh /= maxFactor;
            brv /= maxFactor;
            blh /= maxFactor;
            blv /= maxFactor;
          }
          var topWidth = bounds.width - trh;
          var rightHeight = bounds.height - brv;
          var bottomWidth = bounds.width - brh;
          var leftHeight = bounds.height - blv;
          var borderTopWidth2 = styles.borderTopWidth;
          var borderRightWidth2 = styles.borderRightWidth;
          var borderBottomWidth2 = styles.borderBottomWidth;
          var borderLeftWidth2 = styles.borderLeftWidth;
          var paddingTop2 = getAbsoluteValue(styles.paddingTop, element.bounds.width);
          var paddingRight2 = getAbsoluteValue(styles.paddingRight, element.bounds.width);
          var paddingBottom2 = getAbsoluteValue(styles.paddingBottom, element.bounds.width);
          var paddingLeft2 = getAbsoluteValue(styles.paddingLeft, element.bounds.width);
          this.topLeftBorderDoubleOuterBox = tlh > 0 || tlv > 0 ? getCurvePoints(bounds.left + borderLeftWidth2 / 3, bounds.top + borderTopWidth2 / 3, tlh - borderLeftWidth2 / 3, tlv - borderTopWidth2 / 3, CORNER.TOP_LEFT) : new Vector(bounds.left + borderLeftWidth2 / 3, bounds.top + borderTopWidth2 / 3);
          this.topRightBorderDoubleOuterBox = tlh > 0 || tlv > 0 ? getCurvePoints(bounds.left + topWidth, bounds.top + borderTopWidth2 / 3, trh - borderRightWidth2 / 3, trv - borderTopWidth2 / 3, CORNER.TOP_RIGHT) : new Vector(bounds.left + bounds.width - borderRightWidth2 / 3, bounds.top + borderTopWidth2 / 3);
          this.bottomRightBorderDoubleOuterBox = brh > 0 || brv > 0 ? getCurvePoints(bounds.left + bottomWidth, bounds.top + rightHeight, brh - borderRightWidth2 / 3, brv - borderBottomWidth2 / 3, CORNER.BOTTOM_RIGHT) : new Vector(bounds.left + bounds.width - borderRightWidth2 / 3, bounds.top + bounds.height - borderBottomWidth2 / 3);
          this.bottomLeftBorderDoubleOuterBox = blh > 0 || blv > 0 ? getCurvePoints(bounds.left + borderLeftWidth2 / 3, bounds.top + leftHeight, blh - borderLeftWidth2 / 3, blv - borderBottomWidth2 / 3, CORNER.BOTTOM_LEFT) : new Vector(bounds.left + borderLeftWidth2 / 3, bounds.top + bounds.height - borderBottomWidth2 / 3);
          this.topLeftBorderDoubleInnerBox = tlh > 0 || tlv > 0 ? getCurvePoints(bounds.left + borderLeftWidth2 * 2 / 3, bounds.top + borderTopWidth2 * 2 / 3, tlh - borderLeftWidth2 * 2 / 3, tlv - borderTopWidth2 * 2 / 3, CORNER.TOP_LEFT) : new Vector(bounds.left + borderLeftWidth2 * 2 / 3, bounds.top + borderTopWidth2 * 2 / 3);
          this.topRightBorderDoubleInnerBox = tlh > 0 || tlv > 0 ? getCurvePoints(bounds.left + topWidth, bounds.top + borderTopWidth2 * 2 / 3, trh - borderRightWidth2 * 2 / 3, trv - borderTopWidth2 * 2 / 3, CORNER.TOP_RIGHT) : new Vector(bounds.left + bounds.width - borderRightWidth2 * 2 / 3, bounds.top + borderTopWidth2 * 2 / 3);
          this.bottomRightBorderDoubleInnerBox = brh > 0 || brv > 0 ? getCurvePoints(bounds.left + bottomWidth, bounds.top + rightHeight, brh - borderRightWidth2 * 2 / 3, brv - borderBottomWidth2 * 2 / 3, CORNER.BOTTOM_RIGHT) : new Vector(bounds.left + bounds.width - borderRightWidth2 * 2 / 3, bounds.top + bounds.height - borderBottomWidth2 * 2 / 3);
          this.bottomLeftBorderDoubleInnerBox = blh > 0 || blv > 0 ? getCurvePoints(bounds.left + borderLeftWidth2 * 2 / 3, bounds.top + leftHeight, blh - borderLeftWidth2 * 2 / 3, blv - borderBottomWidth2 * 2 / 3, CORNER.BOTTOM_LEFT) : new Vector(bounds.left + borderLeftWidth2 * 2 / 3, bounds.top + bounds.height - borderBottomWidth2 * 2 / 3);
          this.topLeftBorderStroke = tlh > 0 || tlv > 0 ? getCurvePoints(bounds.left + borderLeftWidth2 / 2, bounds.top + borderTopWidth2 / 2, tlh - borderLeftWidth2 / 2, tlv - borderTopWidth2 / 2, CORNER.TOP_LEFT) : new Vector(bounds.left + borderLeftWidth2 / 2, bounds.top + borderTopWidth2 / 2);
          this.topRightBorderStroke = tlh > 0 || tlv > 0 ? getCurvePoints(bounds.left + topWidth, bounds.top + borderTopWidth2 / 2, trh - borderRightWidth2 / 2, trv - borderTopWidth2 / 2, CORNER.TOP_RIGHT) : new Vector(bounds.left + bounds.width - borderRightWidth2 / 2, bounds.top + borderTopWidth2 / 2);
          this.bottomRightBorderStroke = brh > 0 || brv > 0 ? getCurvePoints(bounds.left + bottomWidth, bounds.top + rightHeight, brh - borderRightWidth2 / 2, brv - borderBottomWidth2 / 2, CORNER.BOTTOM_RIGHT) : new Vector(bounds.left + bounds.width - borderRightWidth2 / 2, bounds.top + bounds.height - borderBottomWidth2 / 2);
          this.bottomLeftBorderStroke = blh > 0 || blv > 0 ? getCurvePoints(bounds.left + borderLeftWidth2 / 2, bounds.top + leftHeight, blh - borderLeftWidth2 / 2, blv - borderBottomWidth2 / 2, CORNER.BOTTOM_LEFT) : new Vector(bounds.left + borderLeftWidth2 / 2, bounds.top + bounds.height - borderBottomWidth2 / 2);
          this.topLeftBorderBox = tlh > 0 || tlv > 0 ? getCurvePoints(bounds.left, bounds.top, tlh, tlv, CORNER.TOP_LEFT) : new Vector(bounds.left, bounds.top);
          this.topRightBorderBox = trh > 0 || trv > 0 ? getCurvePoints(bounds.left + topWidth, bounds.top, trh, trv, CORNER.TOP_RIGHT) : new Vector(bounds.left + bounds.width, bounds.top);
          this.bottomRightBorderBox = brh > 0 || brv > 0 ? getCurvePoints(bounds.left + bottomWidth, bounds.top + rightHeight, brh, brv, CORNER.BOTTOM_RIGHT) : new Vector(bounds.left + bounds.width, bounds.top + bounds.height);
          this.bottomLeftBorderBox = blh > 0 || blv > 0 ? getCurvePoints(bounds.left, bounds.top + leftHeight, blh, blv, CORNER.BOTTOM_LEFT) : new Vector(bounds.left, bounds.top + bounds.height);
          this.topLeftPaddingBox = tlh > 0 || tlv > 0 ? getCurvePoints(bounds.left + borderLeftWidth2, bounds.top + borderTopWidth2, Math.max(0, tlh - borderLeftWidth2), Math.max(0, tlv - borderTopWidth2), CORNER.TOP_LEFT) : new Vector(bounds.left + borderLeftWidth2, bounds.top + borderTopWidth2);
          this.topRightPaddingBox = trh > 0 || trv > 0 ? getCurvePoints(bounds.left + Math.min(topWidth, bounds.width - borderRightWidth2), bounds.top + borderTopWidth2, topWidth > bounds.width + borderRightWidth2 ? 0 : Math.max(0, trh - borderRightWidth2), Math.max(0, trv - borderTopWidth2), CORNER.TOP_RIGHT) : new Vector(bounds.left + bounds.width - borderRightWidth2, bounds.top + borderTopWidth2);
          this.bottomRightPaddingBox = brh > 0 || brv > 0 ? getCurvePoints(bounds.left + Math.min(bottomWidth, bounds.width - borderLeftWidth2), bounds.top + Math.min(rightHeight, bounds.height - borderBottomWidth2), Math.max(0, brh - borderRightWidth2), Math.max(0, brv - borderBottomWidth2), CORNER.BOTTOM_RIGHT) : new Vector(bounds.left + bounds.width - borderRightWidth2, bounds.top + bounds.height - borderBottomWidth2);
          this.bottomLeftPaddingBox = blh > 0 || blv > 0 ? getCurvePoints(bounds.left + borderLeftWidth2, bounds.top + Math.min(leftHeight, bounds.height - borderBottomWidth2), Math.max(0, blh - borderLeftWidth2), Math.max(0, blv - borderBottomWidth2), CORNER.BOTTOM_LEFT) : new Vector(bounds.left + borderLeftWidth2, bounds.top + bounds.height - borderBottomWidth2);
          this.topLeftContentBox = tlh > 0 || tlv > 0 ? getCurvePoints(bounds.left + borderLeftWidth2 + paddingLeft2, bounds.top + borderTopWidth2 + paddingTop2, Math.max(0, tlh - (borderLeftWidth2 + paddingLeft2)), Math.max(0, tlv - (borderTopWidth2 + paddingTop2)), CORNER.TOP_LEFT) : new Vector(bounds.left + borderLeftWidth2 + paddingLeft2, bounds.top + borderTopWidth2 + paddingTop2);
          this.topRightContentBox = trh > 0 || trv > 0 ? getCurvePoints(bounds.left + Math.min(topWidth, bounds.width + borderLeftWidth2 + paddingLeft2), bounds.top + borderTopWidth2 + paddingTop2, topWidth > bounds.width + borderLeftWidth2 + paddingLeft2 ? 0 : trh - borderLeftWidth2 + paddingLeft2, trv - (borderTopWidth2 + paddingTop2), CORNER.TOP_RIGHT) : new Vector(bounds.left + bounds.width - (borderRightWidth2 + paddingRight2), bounds.top + borderTopWidth2 + paddingTop2);
          this.bottomRightContentBox = brh > 0 || brv > 0 ? getCurvePoints(bounds.left + Math.min(bottomWidth, bounds.width - (borderLeftWidth2 + paddingLeft2)), bounds.top + Math.min(rightHeight, bounds.height + borderTopWidth2 + paddingTop2), Math.max(0, brh - (borderRightWidth2 + paddingRight2)), brv - (borderBottomWidth2 + paddingBottom2), CORNER.BOTTOM_RIGHT) : new Vector(bounds.left + bounds.width - (borderRightWidth2 + paddingRight2), bounds.top + bounds.height - (borderBottomWidth2 + paddingBottom2));
          this.bottomLeftContentBox = blh > 0 || blv > 0 ? getCurvePoints(bounds.left + borderLeftWidth2 + paddingLeft2, bounds.top + leftHeight, Math.max(0, blh - (borderLeftWidth2 + paddingLeft2)), blv - (borderBottomWidth2 + paddingBottom2), CORNER.BOTTOM_LEFT) : new Vector(bounds.left + borderLeftWidth2 + paddingLeft2, bounds.top + bounds.height - (borderBottomWidth2 + paddingBottom2));
        }
        return BoundCurves2;
      })();
      (function(CORNER2) {
        CORNER2[CORNER2["TOP_LEFT"] = 0] = "TOP_LEFT";
        CORNER2[CORNER2["TOP_RIGHT"] = 1] = "TOP_RIGHT";
        CORNER2[CORNER2["BOTTOM_RIGHT"] = 2] = "BOTTOM_RIGHT";
        CORNER2[CORNER2["BOTTOM_LEFT"] = 3] = "BOTTOM_LEFT";
      })(CORNER || (CORNER = {}));
      getCurvePoints = function(x, y, r1, r2, position2) {
        var kappa = 4 * ((Math.sqrt(2) - 1) / 3);
        var ox = r1 * kappa;
        var oy = r2 * kappa;
        var xm = x + r1;
        var ym = y + r2;
        switch (position2) {
          case CORNER.TOP_LEFT:
            return new BezierCurve(new Vector(x, ym), new Vector(x, ym - oy), new Vector(xm - ox, y), new Vector(xm, y));
          case CORNER.TOP_RIGHT:
            return new BezierCurve(new Vector(x, y), new Vector(x + ox, y), new Vector(xm, ym - oy), new Vector(xm, ym));
          case CORNER.BOTTOM_RIGHT:
            return new BezierCurve(new Vector(xm, y), new Vector(xm, y + oy), new Vector(x + ox, ym), new Vector(x, ym));
          case CORNER.BOTTOM_LEFT:
          default:
            return new BezierCurve(new Vector(xm, ym), new Vector(xm - ox, ym), new Vector(x, y + oy), new Vector(x, y));
        }
      };
      calculateBorderBoxPath = function(curves) {
        return [curves.topLeftBorderBox, curves.topRightBorderBox, curves.bottomRightBorderBox, curves.bottomLeftBorderBox];
      };
      calculateContentBoxPath = function(curves) {
        return [
          curves.topLeftContentBox,
          curves.topRightContentBox,
          curves.bottomRightContentBox,
          curves.bottomLeftContentBox
        ];
      };
      calculatePaddingBoxPath = function(curves) {
        return [
          curves.topLeftPaddingBox,
          curves.topRightPaddingBox,
          curves.bottomRightPaddingBox,
          curves.bottomLeftPaddingBox
        ];
      };
      TransformEffect = /** @class */
      /* @__PURE__ */ (function() {
        function TransformEffect2(offsetX, offsetY, matrix2) {
          this.offsetX = offsetX;
          this.offsetY = offsetY;
          this.matrix = matrix2;
          this.type = 0;
          this.target = 2 | 4;
        }
        return TransformEffect2;
      })();
      ClipEffect = /** @class */
      /* @__PURE__ */ (function() {
        function ClipEffect2(path, target) {
          this.path = path;
          this.target = target;
          this.type = 1;
        }
        return ClipEffect2;
      })();
      OpacityEffect = /** @class */
      /* @__PURE__ */ (function() {
        function OpacityEffect2(opacity2) {
          this.opacity = opacity2;
          this.type = 2;
          this.target = 2 | 4;
        }
        return OpacityEffect2;
      })();
      isTransformEffect = function(effect) {
        return effect.type === 0;
      };
      isClipEffect = function(effect) {
        return effect.type === 1;
      };
      isOpacityEffect = function(effect) {
        return effect.type === 2;
      };
      equalPath = function(a2, b) {
        if (a2.length === b.length) {
          return a2.some(function(v, i) {
            return v === b[i];
          });
        }
        return false;
      };
      transformPath = function(path, deltaX, deltaY, deltaW, deltaH) {
        return path.map(function(point, index) {
          switch (index) {
            case 0:
              return point.add(deltaX, deltaY);
            case 1:
              return point.add(deltaX + deltaW, deltaY);
            case 2:
              return point.add(deltaX + deltaW, deltaY + deltaH);
            case 3:
              return point.add(deltaX, deltaY + deltaH);
          }
          return point;
        });
      };
      StackingContext = /** @class */
      /* @__PURE__ */ (function() {
        function StackingContext2(container) {
          this.element = container;
          this.inlineLevel = [];
          this.nonInlineLevel = [];
          this.negativeZIndex = [];
          this.zeroOrAutoZIndexOrTransformedOrOpacity = [];
          this.positiveZIndex = [];
          this.nonPositionedFloats = [];
          this.nonPositionedInlineLevel = [];
        }
        return StackingContext2;
      })();
      ElementPaint = /** @class */
      (function() {
        function ElementPaint2(container, parent) {
          this.container = container;
          this.parent = parent;
          this.effects = [];
          this.curves = new BoundCurves(this.container);
          if (this.container.styles.opacity < 1) {
            this.effects.push(new OpacityEffect(this.container.styles.opacity));
          }
          if (this.container.styles.transform !== null) {
            var offsetX = this.container.bounds.left + this.container.styles.transformOrigin[0].number;
            var offsetY = this.container.bounds.top + this.container.styles.transformOrigin[1].number;
            var matrix2 = this.container.styles.transform;
            this.effects.push(new TransformEffect(offsetX, offsetY, matrix2));
          }
          if (this.container.styles.overflowX !== 0) {
            var borderBox = calculateBorderBoxPath(this.curves);
            var paddingBox2 = calculatePaddingBoxPath(this.curves);
            if (equalPath(borderBox, paddingBox2)) {
              this.effects.push(new ClipEffect(
                borderBox,
                2 | 4
                /* CONTENT */
              ));
            } else {
              this.effects.push(new ClipEffect(
                borderBox,
                2
                /* BACKGROUND_BORDERS */
              ));
              this.effects.push(new ClipEffect(
                paddingBox2,
                4
                /* CONTENT */
              ));
            }
          }
        }
        ElementPaint2.prototype.getEffects = function(target) {
          var inFlow = [
            2,
            3
            /* FIXED */
          ].indexOf(this.container.styles.position) === -1;
          var parent = this.parent;
          var effects = this.effects.slice(0);
          while (parent) {
            var croplessEffects = parent.effects.filter(function(effect) {
              return !isClipEffect(effect);
            });
            if (inFlow || parent.container.styles.position !== 0 || !parent.parent) {
              effects.unshift.apply(effects, croplessEffects);
              inFlow = [
                2,
                3
                /* FIXED */
              ].indexOf(parent.container.styles.position) === -1;
              if (parent.container.styles.overflowX !== 0) {
                var borderBox = calculateBorderBoxPath(parent.curves);
                var paddingBox2 = calculatePaddingBoxPath(parent.curves);
                if (!equalPath(borderBox, paddingBox2)) {
                  effects.unshift(new ClipEffect(
                    paddingBox2,
                    2 | 4
                    /* CONTENT */
                  ));
                }
              }
            } else {
              effects.unshift.apply(effects, croplessEffects);
            }
            parent = parent.parent;
          }
          return effects.filter(function(effect) {
            return contains(effect.target, target);
          });
        };
        return ElementPaint2;
      })();
      parseStackTree = function(parent, stackingContext, realStackingContext, listItems) {
        parent.container.elements.forEach(function(child) {
          var treatAsRealStackingContext = contains(
            child.flags,
            4
            /* CREATES_REAL_STACKING_CONTEXT */
          );
          var createsStackingContext2 = contains(
            child.flags,
            2
            /* CREATES_STACKING_CONTEXT */
          );
          var paintContainer = new ElementPaint(child, parent);
          if (contains(
            child.styles.display,
            2048
            /* LIST_ITEM */
          )) {
            listItems.push(paintContainer);
          }
          var listOwnerItems = contains(
            child.flags,
            8
            /* IS_LIST_OWNER */
          ) ? [] : listItems;
          if (treatAsRealStackingContext || createsStackingContext2) {
            var parentStack = treatAsRealStackingContext || child.styles.isPositioned() ? realStackingContext : stackingContext;
            var stack = new StackingContext(paintContainer);
            if (child.styles.isPositioned() || child.styles.opacity < 1 || child.styles.isTransformed()) {
              var order_1 = child.styles.zIndex.order;
              if (order_1 < 0) {
                var index_1 = 0;
                parentStack.negativeZIndex.some(function(current, i) {
                  if (order_1 > current.element.container.styles.zIndex.order) {
                    index_1 = i;
                    return false;
                  } else if (index_1 > 0) {
                    return true;
                  }
                  return false;
                });
                parentStack.negativeZIndex.splice(index_1, 0, stack);
              } else if (order_1 > 0) {
                var index_2 = 0;
                parentStack.positiveZIndex.some(function(current, i) {
                  if (order_1 >= current.element.container.styles.zIndex.order) {
                    index_2 = i + 1;
                    return false;
                  } else if (index_2 > 0) {
                    return true;
                  }
                  return false;
                });
                parentStack.positiveZIndex.splice(index_2, 0, stack);
              } else {
                parentStack.zeroOrAutoZIndexOrTransformedOrOpacity.push(stack);
              }
            } else {
              if (child.styles.isFloating()) {
                parentStack.nonPositionedFloats.push(stack);
              } else {
                parentStack.nonPositionedInlineLevel.push(stack);
              }
            }
            parseStackTree(paintContainer, stack, treatAsRealStackingContext ? stack : realStackingContext, listOwnerItems);
          } else {
            if (child.styles.isInlineLevel()) {
              stackingContext.inlineLevel.push(paintContainer);
            } else {
              stackingContext.nonInlineLevel.push(paintContainer);
            }
            parseStackTree(paintContainer, stackingContext, realStackingContext, listOwnerItems);
          }
          if (contains(
            child.flags,
            8
            /* IS_LIST_OWNER */
          )) {
            processListItems(child, listOwnerItems);
          }
        });
      };
      processListItems = function(owner, elements) {
        var numbering = owner instanceof OLElementContainer ? owner.start : 1;
        var reversed = owner instanceof OLElementContainer ? owner.reversed : false;
        for (var i = 0; i < elements.length; i++) {
          var item = elements[i];
          if (item.container instanceof LIElementContainer && typeof item.container.value === "number" && item.container.value !== 0) {
            numbering = item.container.value;
          }
          item.listValue = createCounterText(numbering, item.container.styles.listStyleType, true);
          numbering += reversed ? -1 : 1;
        }
      };
      parseStackingContexts = function(container) {
        var paintContainer = new ElementPaint(container, null);
        var root = new StackingContext(paintContainer);
        var listItems = [];
        parseStackTree(paintContainer, root, root, listItems);
        processListItems(paintContainer.container, listItems);
        return root;
      };
      parsePathForBorder = function(curves, borderSide) {
        switch (borderSide) {
          case 0:
            return createPathFromCurves(curves.topLeftBorderBox, curves.topLeftPaddingBox, curves.topRightBorderBox, curves.topRightPaddingBox);
          case 1:
            return createPathFromCurves(curves.topRightBorderBox, curves.topRightPaddingBox, curves.bottomRightBorderBox, curves.bottomRightPaddingBox);
          case 2:
            return createPathFromCurves(curves.bottomRightBorderBox, curves.bottomRightPaddingBox, curves.bottomLeftBorderBox, curves.bottomLeftPaddingBox);
          case 3:
          default:
            return createPathFromCurves(curves.bottomLeftBorderBox, curves.bottomLeftPaddingBox, curves.topLeftBorderBox, curves.topLeftPaddingBox);
        }
      };
      parsePathForBorderDoubleOuter = function(curves, borderSide) {
        switch (borderSide) {
          case 0:
            return createPathFromCurves(curves.topLeftBorderBox, curves.topLeftBorderDoubleOuterBox, curves.topRightBorderBox, curves.topRightBorderDoubleOuterBox);
          case 1:
            return createPathFromCurves(curves.topRightBorderBox, curves.topRightBorderDoubleOuterBox, curves.bottomRightBorderBox, curves.bottomRightBorderDoubleOuterBox);
          case 2:
            return createPathFromCurves(curves.bottomRightBorderBox, curves.bottomRightBorderDoubleOuterBox, curves.bottomLeftBorderBox, curves.bottomLeftBorderDoubleOuterBox);
          case 3:
          default:
            return createPathFromCurves(curves.bottomLeftBorderBox, curves.bottomLeftBorderDoubleOuterBox, curves.topLeftBorderBox, curves.topLeftBorderDoubleOuterBox);
        }
      };
      parsePathForBorderDoubleInner = function(curves, borderSide) {
        switch (borderSide) {
          case 0:
            return createPathFromCurves(curves.topLeftBorderDoubleInnerBox, curves.topLeftPaddingBox, curves.topRightBorderDoubleInnerBox, curves.topRightPaddingBox);
          case 1:
            return createPathFromCurves(curves.topRightBorderDoubleInnerBox, curves.topRightPaddingBox, curves.bottomRightBorderDoubleInnerBox, curves.bottomRightPaddingBox);
          case 2:
            return createPathFromCurves(curves.bottomRightBorderDoubleInnerBox, curves.bottomRightPaddingBox, curves.bottomLeftBorderDoubleInnerBox, curves.bottomLeftPaddingBox);
          case 3:
          default:
            return createPathFromCurves(curves.bottomLeftBorderDoubleInnerBox, curves.bottomLeftPaddingBox, curves.topLeftBorderDoubleInnerBox, curves.topLeftPaddingBox);
        }
      };
      parsePathForBorderStroke = function(curves, borderSide) {
        switch (borderSide) {
          case 0:
            return createStrokePathFromCurves(curves.topLeftBorderStroke, curves.topRightBorderStroke);
          case 1:
            return createStrokePathFromCurves(curves.topRightBorderStroke, curves.bottomRightBorderStroke);
          case 2:
            return createStrokePathFromCurves(curves.bottomRightBorderStroke, curves.bottomLeftBorderStroke);
          case 3:
          default:
            return createStrokePathFromCurves(curves.bottomLeftBorderStroke, curves.topLeftBorderStroke);
        }
      };
      createStrokePathFromCurves = function(outer1, outer2) {
        var path = [];
        if (isBezierCurve(outer1)) {
          path.push(outer1.subdivide(0.5, false));
        } else {
          path.push(outer1);
        }
        if (isBezierCurve(outer2)) {
          path.push(outer2.subdivide(0.5, true));
        } else {
          path.push(outer2);
        }
        return path;
      };
      createPathFromCurves = function(outer1, inner1, outer2, inner2) {
        var path = [];
        if (isBezierCurve(outer1)) {
          path.push(outer1.subdivide(0.5, false));
        } else {
          path.push(outer1);
        }
        if (isBezierCurve(outer2)) {
          path.push(outer2.subdivide(0.5, true));
        } else {
          path.push(outer2);
        }
        if (isBezierCurve(inner2)) {
          path.push(inner2.subdivide(0.5, true).reverse());
        } else {
          path.push(inner2);
        }
        if (isBezierCurve(inner1)) {
          path.push(inner1.subdivide(0.5, false).reverse());
        } else {
          path.push(inner1);
        }
        return path;
      };
      paddingBox = function(element) {
        var bounds = element.bounds;
        var styles = element.styles;
        return bounds.add(styles.borderLeftWidth, styles.borderTopWidth, -(styles.borderRightWidth + styles.borderLeftWidth), -(styles.borderTopWidth + styles.borderBottomWidth));
      };
      contentBox = function(element) {
        var styles = element.styles;
        var bounds = element.bounds;
        var paddingLeft2 = getAbsoluteValue(styles.paddingLeft, bounds.width);
        var paddingRight2 = getAbsoluteValue(styles.paddingRight, bounds.width);
        var paddingTop2 = getAbsoluteValue(styles.paddingTop, bounds.width);
        var paddingBottom2 = getAbsoluteValue(styles.paddingBottom, bounds.width);
        return bounds.add(paddingLeft2 + styles.borderLeftWidth, paddingTop2 + styles.borderTopWidth, -(styles.borderRightWidth + styles.borderLeftWidth + paddingLeft2 + paddingRight2), -(styles.borderTopWidth + styles.borderBottomWidth + paddingTop2 + paddingBottom2));
      };
      calculateBackgroundPositioningArea = function(backgroundOrigin2, element) {
        if (backgroundOrigin2 === 0) {
          return element.bounds;
        }
        if (backgroundOrigin2 === 2) {
          return contentBox(element);
        }
        return paddingBox(element);
      };
      calculateBackgroundPaintingArea = function(backgroundClip2, element) {
        if (backgroundClip2 === 0) {
          return element.bounds;
        }
        if (backgroundClip2 === 2) {
          return contentBox(element);
        }
        return paddingBox(element);
      };
      calculateBackgroundRendering = function(container, index, intrinsicSize) {
        var backgroundPositioningArea = calculateBackgroundPositioningArea(getBackgroundValueForIndex(container.styles.backgroundOrigin, index), container);
        var backgroundPaintingArea = calculateBackgroundPaintingArea(getBackgroundValueForIndex(container.styles.backgroundClip, index), container);
        var backgroundImageSize = calculateBackgroundSize(getBackgroundValueForIndex(container.styles.backgroundSize, index), intrinsicSize, backgroundPositioningArea);
        var sizeWidth = backgroundImageSize[0], sizeHeight = backgroundImageSize[1];
        var position2 = getAbsoluteValueForTuple(getBackgroundValueForIndex(container.styles.backgroundPosition, index), backgroundPositioningArea.width - sizeWidth, backgroundPositioningArea.height - sizeHeight);
        var path = calculateBackgroundRepeatPath(getBackgroundValueForIndex(container.styles.backgroundRepeat, index), position2, backgroundImageSize, backgroundPositioningArea, backgroundPaintingArea);
        var offsetX = Math.round(backgroundPositioningArea.left + position2[0]);
        var offsetY = Math.round(backgroundPositioningArea.top + position2[1]);
        return [path, offsetX, offsetY, sizeWidth, sizeHeight];
      };
      isAuto = function(token) {
        return isIdentToken(token) && token.value === BACKGROUND_SIZE.AUTO;
      };
      hasIntrinsicValue = function(value) {
        return typeof value === "number";
      };
      calculateBackgroundSize = function(size, _a, bounds) {
        var intrinsicWidth = _a[0], intrinsicHeight = _a[1], intrinsicProportion = _a[2];
        var first = size[0], second = size[1];
        if (!first) {
          return [0, 0];
        }
        if (isLengthPercentage(first) && second && isLengthPercentage(second)) {
          return [getAbsoluteValue(first, bounds.width), getAbsoluteValue(second, bounds.height)];
        }
        var hasIntrinsicProportion = hasIntrinsicValue(intrinsicProportion);
        if (isIdentToken(first) && (first.value === BACKGROUND_SIZE.CONTAIN || first.value === BACKGROUND_SIZE.COVER)) {
          if (hasIntrinsicValue(intrinsicProportion)) {
            var targetRatio = bounds.width / bounds.height;
            return targetRatio < intrinsicProportion !== (first.value === BACKGROUND_SIZE.COVER) ? [bounds.width, bounds.width / intrinsicProportion] : [bounds.height * intrinsicProportion, bounds.height];
          }
          return [bounds.width, bounds.height];
        }
        var hasIntrinsicWidth = hasIntrinsicValue(intrinsicWidth);
        var hasIntrinsicHeight = hasIntrinsicValue(intrinsicHeight);
        var hasIntrinsicDimensions = hasIntrinsicWidth || hasIntrinsicHeight;
        if (isAuto(first) && (!second || isAuto(second))) {
          if (hasIntrinsicWidth && hasIntrinsicHeight) {
            return [intrinsicWidth, intrinsicHeight];
          }
          if (!hasIntrinsicProportion && !hasIntrinsicDimensions) {
            return [bounds.width, bounds.height];
          }
          if (hasIntrinsicDimensions && hasIntrinsicProportion) {
            var width_1 = hasIntrinsicWidth ? intrinsicWidth : intrinsicHeight * intrinsicProportion;
            var height_1 = hasIntrinsicHeight ? intrinsicHeight : intrinsicWidth / intrinsicProportion;
            return [width_1, height_1];
          }
          var width_2 = hasIntrinsicWidth ? intrinsicWidth : bounds.width;
          var height_2 = hasIntrinsicHeight ? intrinsicHeight : bounds.height;
          return [width_2, height_2];
        }
        if (hasIntrinsicProportion) {
          var width_3 = 0;
          var height_3 = 0;
          if (isLengthPercentage(first)) {
            width_3 = getAbsoluteValue(first, bounds.width);
          } else if (isLengthPercentage(second)) {
            height_3 = getAbsoluteValue(second, bounds.height);
          }
          if (isAuto(first)) {
            width_3 = height_3 * intrinsicProportion;
          } else if (!second || isAuto(second)) {
            height_3 = width_3 / intrinsicProportion;
          }
          return [width_3, height_3];
        }
        var width = null;
        var height = null;
        if (isLengthPercentage(first)) {
          width = getAbsoluteValue(first, bounds.width);
        } else if (second && isLengthPercentage(second)) {
          height = getAbsoluteValue(second, bounds.height);
        }
        if (width !== null && (!second || isAuto(second))) {
          height = hasIntrinsicWidth && hasIntrinsicHeight ? width / intrinsicWidth * intrinsicHeight : bounds.height;
        }
        if (height !== null && isAuto(first)) {
          width = hasIntrinsicWidth && hasIntrinsicHeight ? height / intrinsicHeight * intrinsicWidth : bounds.width;
        }
        if (width !== null && height !== null) {
          return [width, height];
        }
        throw new Error("Unable to calculate background-size for element");
      };
      getBackgroundValueForIndex = function(values, index) {
        var value = values[index];
        if (typeof value === "undefined") {
          return values[0];
        }
        return value;
      };
      calculateBackgroundRepeatPath = function(repeat, _a, _b, backgroundPositioningArea, backgroundPaintingArea) {
        var x = _a[0], y = _a[1];
        var width = _b[0], height = _b[1];
        switch (repeat) {
          case 2:
            return [
              new Vector(Math.round(backgroundPositioningArea.left), Math.round(backgroundPositioningArea.top + y)),
              new Vector(Math.round(backgroundPositioningArea.left + backgroundPositioningArea.width), Math.round(backgroundPositioningArea.top + y)),
              new Vector(Math.round(backgroundPositioningArea.left + backgroundPositioningArea.width), Math.round(height + backgroundPositioningArea.top + y)),
              new Vector(Math.round(backgroundPositioningArea.left), Math.round(height + backgroundPositioningArea.top + y))
            ];
          case 3:
            return [
              new Vector(Math.round(backgroundPositioningArea.left + x), Math.round(backgroundPositioningArea.top)),
              new Vector(Math.round(backgroundPositioningArea.left + x + width), Math.round(backgroundPositioningArea.top)),
              new Vector(Math.round(backgroundPositioningArea.left + x + width), Math.round(backgroundPositioningArea.height + backgroundPositioningArea.top)),
              new Vector(Math.round(backgroundPositioningArea.left + x), Math.round(backgroundPositioningArea.height + backgroundPositioningArea.top))
            ];
          case 1:
            return [
              new Vector(Math.round(backgroundPositioningArea.left + x), Math.round(backgroundPositioningArea.top + y)),
              new Vector(Math.round(backgroundPositioningArea.left + x + width), Math.round(backgroundPositioningArea.top + y)),
              new Vector(Math.round(backgroundPositioningArea.left + x + width), Math.round(backgroundPositioningArea.top + y + height)),
              new Vector(Math.round(backgroundPositioningArea.left + x), Math.round(backgroundPositioningArea.top + y + height))
            ];
          default:
            return [
              new Vector(Math.round(backgroundPaintingArea.left), Math.round(backgroundPaintingArea.top)),
              new Vector(Math.round(backgroundPaintingArea.left + backgroundPaintingArea.width), Math.round(backgroundPaintingArea.top)),
              new Vector(Math.round(backgroundPaintingArea.left + backgroundPaintingArea.width), Math.round(backgroundPaintingArea.height + backgroundPaintingArea.top)),
              new Vector(Math.round(backgroundPaintingArea.left), Math.round(backgroundPaintingArea.height + backgroundPaintingArea.top))
            ];
        }
      };
      SMALL_IMAGE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
      SAMPLE_TEXT = "Hidden Text";
      FontMetrics = /** @class */
      (function() {
        function FontMetrics2(document2) {
          this._data = {};
          this._document = document2;
        }
        FontMetrics2.prototype.parseMetrics = function(fontFamily2, fontSize2) {
          var container = this._document.createElement("div");
          var img = this._document.createElement("img");
          var span = this._document.createElement("span");
          var body = this._document.body;
          container.style.visibility = "hidden";
          container.style.fontFamily = fontFamily2;
          container.style.fontSize = fontSize2;
          container.style.margin = "0";
          container.style.padding = "0";
          container.style.whiteSpace = "nowrap";
          body.appendChild(container);
          img.src = SMALL_IMAGE;
          img.width = 1;
          img.height = 1;
          img.style.margin = "0";
          img.style.padding = "0";
          img.style.verticalAlign = "baseline";
          span.style.fontFamily = fontFamily2;
          span.style.fontSize = fontSize2;
          span.style.margin = "0";
          span.style.padding = "0";
          span.appendChild(this._document.createTextNode(SAMPLE_TEXT));
          container.appendChild(span);
          container.appendChild(img);
          var baseline = img.offsetTop - span.offsetTop + 2;
          container.removeChild(span);
          container.appendChild(this._document.createTextNode(SAMPLE_TEXT));
          container.style.lineHeight = "normal";
          img.style.verticalAlign = "super";
          var middle = img.offsetTop - container.offsetTop + 2;
          body.removeChild(container);
          return { baseline, middle };
        };
        FontMetrics2.prototype.getMetrics = function(fontFamily2, fontSize2) {
          var key = fontFamily2 + " " + fontSize2;
          if (typeof this._data[key] === "undefined") {
            this._data[key] = this.parseMetrics(fontFamily2, fontSize2);
          }
          return this._data[key];
        };
        return FontMetrics2;
      })();
      Renderer = /** @class */
      /* @__PURE__ */ (function() {
        function Renderer2(context, options) {
          this.context = context;
          this.options = options;
        }
        return Renderer2;
      })();
      MASK_OFFSET = 1e4;
      CanvasRenderer = /** @class */
      (function(_super) {
        __extends(CanvasRenderer2, _super);
        function CanvasRenderer2(context, options) {
          var _this = _super.call(this, context, options) || this;
          _this._activeEffects = [];
          _this.canvas = options.canvas ? options.canvas : document.createElement("canvas");
          _this.ctx = _this.canvas.getContext("2d");
          if (!options.canvas) {
            _this.canvas.width = Math.floor(options.width * options.scale);
            _this.canvas.height = Math.floor(options.height * options.scale);
            _this.canvas.style.width = options.width + "px";
            _this.canvas.style.height = options.height + "px";
          }
          _this.fontMetrics = new FontMetrics(document);
          _this.ctx.scale(_this.options.scale, _this.options.scale);
          _this.ctx.translate(-options.x, -options.y);
          _this.ctx.textBaseline = "bottom";
          _this._activeEffects = [];
          _this.context.logger.debug("Canvas renderer initialized (" + options.width + "x" + options.height + ") with scale " + options.scale);
          return _this;
        }
        CanvasRenderer2.prototype.applyEffects = function(effects) {
          var _this = this;
          while (this._activeEffects.length) {
            this.popEffect();
          }
          effects.forEach(function(effect) {
            return _this.applyEffect(effect);
          });
        };
        CanvasRenderer2.prototype.applyEffect = function(effect) {
          this.ctx.save();
          if (isOpacityEffect(effect)) {
            this.ctx.globalAlpha = effect.opacity;
          }
          if (isTransformEffect(effect)) {
            this.ctx.translate(effect.offsetX, effect.offsetY);
            this.ctx.transform(effect.matrix[0], effect.matrix[1], effect.matrix[2], effect.matrix[3], effect.matrix[4], effect.matrix[5]);
            this.ctx.translate(-effect.offsetX, -effect.offsetY);
          }
          if (isClipEffect(effect)) {
            this.path(effect.path);
            this.ctx.clip();
          }
          this._activeEffects.push(effect);
        };
        CanvasRenderer2.prototype.popEffect = function() {
          this._activeEffects.pop();
          this.ctx.restore();
        };
        CanvasRenderer2.prototype.renderStack = function(stack) {
          return __awaiter(this, void 0, void 0, function() {
            var styles;
            return __generator(this, function(_a) {
              switch (_a.label) {
                case 0:
                  styles = stack.element.container.styles;
                  if (!styles.isVisible()) return [3, 2];
                  return [4, this.renderStackContent(stack)];
                case 1:
                  _a.sent();
                  _a.label = 2;
                case 2:
                  return [
                    2
                    /*return*/
                  ];
              }
            });
          });
        };
        CanvasRenderer2.prototype.renderNode = function(paint) {
          return __awaiter(this, void 0, void 0, function() {
            return __generator(this, function(_a) {
              switch (_a.label) {
                case 0:
                  if (contains(
                    paint.container.flags,
                    16
                    /* DEBUG_RENDER */
                  )) {
                    debugger;
                  }
                  if (!paint.container.styles.isVisible()) return [3, 3];
                  return [4, this.renderNodeBackgroundAndBorders(paint)];
                case 1:
                  _a.sent();
                  return [4, this.renderNodeContent(paint)];
                case 2:
                  _a.sent();
                  _a.label = 3;
                case 3:
                  return [
                    2
                    /*return*/
                  ];
              }
            });
          });
        };
        CanvasRenderer2.prototype.renderTextWithLetterSpacing = function(text, letterSpacing2, baseline) {
          var _this = this;
          if (letterSpacing2 === 0) {
            this.ctx.fillText(text.text, text.bounds.left, text.bounds.top + baseline);
          } else {
            var letters = segmentGraphemes(text.text);
            letters.reduce(function(left, letter) {
              _this.ctx.fillText(letter, left, text.bounds.top + baseline);
              return left + _this.ctx.measureText(letter).width;
            }, text.bounds.left);
          }
        };
        CanvasRenderer2.prototype.createFontStyle = function(styles) {
          var fontVariant2 = styles.fontVariant.filter(function(variant) {
            return variant === "normal" || variant === "small-caps";
          }).join("");
          var fontFamily2 = fixIOSSystemFonts(styles.fontFamily).join(", ");
          var fontSize2 = isDimensionToken(styles.fontSize) ? "" + styles.fontSize.number + styles.fontSize.unit : styles.fontSize.number + "px";
          return [
            [styles.fontStyle, fontVariant2, styles.fontWeight, fontSize2, fontFamily2].join(" "),
            fontFamily2,
            fontSize2
          ];
        };
        CanvasRenderer2.prototype.renderTextNode = function(text, styles) {
          return __awaiter(this, void 0, void 0, function() {
            var _a, font, fontFamily2, fontSize2, _b, baseline, middle, paintOrder2;
            var _this = this;
            return __generator(this, function(_c) {
              _a = this.createFontStyle(styles), font = _a[0], fontFamily2 = _a[1], fontSize2 = _a[2];
              this.ctx.font = font;
              this.ctx.direction = styles.direction === 1 ? "rtl" : "ltr";
              this.ctx.textAlign = "left";
              this.ctx.textBaseline = "alphabetic";
              _b = this.fontMetrics.getMetrics(fontFamily2, fontSize2), baseline = _b.baseline, middle = _b.middle;
              paintOrder2 = styles.paintOrder;
              text.textBounds.forEach(function(text2) {
                paintOrder2.forEach(function(paintOrderLayer) {
                  switch (paintOrderLayer) {
                    case 0:
                      _this.ctx.fillStyle = asString(styles.color);
                      _this.renderTextWithLetterSpacing(text2, styles.letterSpacing, baseline);
                      var textShadows = styles.textShadow;
                      if (textShadows.length && text2.text.trim().length) {
                        textShadows.slice(0).reverse().forEach(function(textShadow2) {
                          _this.ctx.shadowColor = asString(textShadow2.color);
                          _this.ctx.shadowOffsetX = textShadow2.offsetX.number * _this.options.scale;
                          _this.ctx.shadowOffsetY = textShadow2.offsetY.number * _this.options.scale;
                          _this.ctx.shadowBlur = textShadow2.blur.number;
                          _this.renderTextWithLetterSpacing(text2, styles.letterSpacing, baseline);
                        });
                        _this.ctx.shadowColor = "";
                        _this.ctx.shadowOffsetX = 0;
                        _this.ctx.shadowOffsetY = 0;
                        _this.ctx.shadowBlur = 0;
                      }
                      if (styles.textDecorationLine.length) {
                        _this.ctx.fillStyle = asString(styles.textDecorationColor || styles.color);
                        styles.textDecorationLine.forEach(function(textDecorationLine2) {
                          switch (textDecorationLine2) {
                            case 1:
                              _this.ctx.fillRect(text2.bounds.left, Math.round(text2.bounds.top + baseline), text2.bounds.width, 1);
                              break;
                            case 2:
                              _this.ctx.fillRect(text2.bounds.left, Math.round(text2.bounds.top), text2.bounds.width, 1);
                              break;
                            case 3:
                              _this.ctx.fillRect(text2.bounds.left, Math.ceil(text2.bounds.top + middle), text2.bounds.width, 1);
                              break;
                          }
                        });
                      }
                      break;
                    case 1:
                      if (styles.webkitTextStrokeWidth && text2.text.trim().length) {
                        _this.ctx.strokeStyle = asString(styles.webkitTextStrokeColor);
                        _this.ctx.lineWidth = styles.webkitTextStrokeWidth;
                        _this.ctx.lineJoin = !!window.chrome ? "miter" : "round";
                        _this.ctx.strokeText(text2.text, text2.bounds.left, text2.bounds.top + baseline);
                      }
                      _this.ctx.strokeStyle = "";
                      _this.ctx.lineWidth = 0;
                      _this.ctx.lineJoin = "miter";
                      break;
                  }
                });
              });
              return [
                2
                /*return*/
              ];
            });
          });
        };
        CanvasRenderer2.prototype.renderReplacedElement = function(container, curves, image2) {
          if (image2 && container.intrinsicWidth > 0 && container.intrinsicHeight > 0) {
            var box = contentBox(container);
            var path = calculatePaddingBoxPath(curves);
            this.path(path);
            this.ctx.save();
            this.ctx.clip();
            this.ctx.drawImage(image2, 0, 0, container.intrinsicWidth, container.intrinsicHeight, box.left, box.top, box.width, box.height);
            this.ctx.restore();
          }
        };
        CanvasRenderer2.prototype.renderNodeContent = function(paint) {
          return __awaiter(this, void 0, void 0, function() {
            var container, curves, styles, _i, _a, child, image2, image2, iframeRenderer, canvas, size, _b, fontFamily2, fontSize2, baseline, bounds, x, textBounds, img, image2, url, fontFamily2, bounds;
            return __generator(this, function(_c) {
              switch (_c.label) {
                case 0:
                  this.applyEffects(paint.getEffects(
                    4
                    /* CONTENT */
                  ));
                  container = paint.container;
                  curves = paint.curves;
                  styles = container.styles;
                  _i = 0, _a = container.textNodes;
                  _c.label = 1;
                case 1:
                  if (!(_i < _a.length)) return [3, 4];
                  child = _a[_i];
                  return [4, this.renderTextNode(child, styles)];
                case 2:
                  _c.sent();
                  _c.label = 3;
                case 3:
                  _i++;
                  return [3, 1];
                case 4:
                  if (!(container instanceof ImageElementContainer)) return [3, 8];
                  _c.label = 5;
                case 5:
                  _c.trys.push([5, 7, , 8]);
                  return [4, this.context.cache.match(container.src)];
                case 6:
                  image2 = _c.sent();
                  this.renderReplacedElement(container, curves, image2);
                  return [3, 8];
                case 7:
                  _c.sent();
                  this.context.logger.error("Error loading image " + container.src);
                  return [3, 8];
                case 8:
                  if (container instanceof CanvasElementContainer) {
                    this.renderReplacedElement(container, curves, container.canvas);
                  }
                  if (!(container instanceof SVGElementContainer)) return [3, 12];
                  _c.label = 9;
                case 9:
                  _c.trys.push([9, 11, , 12]);
                  return [4, this.context.cache.match(container.svg)];
                case 10:
                  image2 = _c.sent();
                  this.renderReplacedElement(container, curves, image2);
                  return [3, 12];
                case 11:
                  _c.sent();
                  this.context.logger.error("Error loading svg " + container.svg.substring(0, 255));
                  return [3, 12];
                case 12:
                  if (!(container instanceof IFrameElementContainer && container.tree)) return [3, 14];
                  iframeRenderer = new CanvasRenderer2(this.context, {
                    scale: this.options.scale,
                    backgroundColor: container.backgroundColor,
                    x: 0,
                    y: 0,
                    width: container.width,
                    height: container.height
                  });
                  return [4, iframeRenderer.render(container.tree)];
                case 13:
                  canvas = _c.sent();
                  if (container.width && container.height) {
                    this.ctx.drawImage(canvas, 0, 0, container.width, container.height, container.bounds.left, container.bounds.top, container.bounds.width, container.bounds.height);
                  }
                  _c.label = 14;
                case 14:
                  if (container instanceof InputElementContainer) {
                    size = Math.min(container.bounds.width, container.bounds.height);
                    if (container.type === CHECKBOX) {
                      if (container.checked) {
                        this.ctx.save();
                        this.path([
                          new Vector(container.bounds.left + size * 0.39363, container.bounds.top + size * 0.79),
                          new Vector(container.bounds.left + size * 0.16, container.bounds.top + size * 0.5549),
                          new Vector(container.bounds.left + size * 0.27347, container.bounds.top + size * 0.44071),
                          new Vector(container.bounds.left + size * 0.39694, container.bounds.top + size * 0.5649),
                          new Vector(container.bounds.left + size * 0.72983, container.bounds.top + size * 0.23),
                          new Vector(container.bounds.left + size * 0.84, container.bounds.top + size * 0.34085),
                          new Vector(container.bounds.left + size * 0.39363, container.bounds.top + size * 0.79)
                        ]);
                        this.ctx.fillStyle = asString(INPUT_COLOR);
                        this.ctx.fill();
                        this.ctx.restore();
                      }
                    } else if (container.type === RADIO) {
                      if (container.checked) {
                        this.ctx.save();
                        this.ctx.beginPath();
                        this.ctx.arc(container.bounds.left + size / 2, container.bounds.top + size / 2, size / 4, 0, Math.PI * 2, true);
                        this.ctx.fillStyle = asString(INPUT_COLOR);
                        this.ctx.fill();
                        this.ctx.restore();
                      }
                    }
                  }
                  if (isTextInputElement(container) && container.value.length) {
                    _b = this.createFontStyle(styles), fontFamily2 = _b[0], fontSize2 = _b[1];
                    baseline = this.fontMetrics.getMetrics(fontFamily2, fontSize2).baseline;
                    this.ctx.font = fontFamily2;
                    this.ctx.fillStyle = asString(styles.color);
                    this.ctx.textBaseline = "alphabetic";
                    this.ctx.textAlign = canvasTextAlign(container.styles.textAlign);
                    bounds = contentBox(container);
                    x = 0;
                    switch (container.styles.textAlign) {
                      case 1:
                        x += bounds.width / 2;
                        break;
                      case 2:
                        x += bounds.width;
                        break;
                    }
                    textBounds = bounds.add(x, 0, 0, -bounds.height / 2 + 1);
                    this.ctx.save();
                    this.path([
                      new Vector(bounds.left, bounds.top),
                      new Vector(bounds.left + bounds.width, bounds.top),
                      new Vector(bounds.left + bounds.width, bounds.top + bounds.height),
                      new Vector(bounds.left, bounds.top + bounds.height)
                    ]);
                    this.ctx.clip();
                    this.renderTextWithLetterSpacing(new TextBounds(container.value, textBounds), styles.letterSpacing, baseline);
                    this.ctx.restore();
                    this.ctx.textBaseline = "alphabetic";
                    this.ctx.textAlign = "left";
                  }
                  if (!contains(
                    container.styles.display,
                    2048
                    /* LIST_ITEM */
                  )) return [3, 20];
                  if (!(container.styles.listStyleImage !== null)) return [3, 19];
                  img = container.styles.listStyleImage;
                  if (!(img.type === 0)) return [3, 18];
                  image2 = void 0;
                  url = img.url;
                  _c.label = 15;
                case 15:
                  _c.trys.push([15, 17, , 18]);
                  return [4, this.context.cache.match(url)];
                case 16:
                  image2 = _c.sent();
                  this.ctx.drawImage(image2, container.bounds.left - (image2.width + 10), container.bounds.top);
                  return [3, 18];
                case 17:
                  _c.sent();
                  this.context.logger.error("Error loading list-style-image " + url);
                  return [3, 18];
                case 18:
                  return [3, 20];
                case 19:
                  if (paint.listValue && container.styles.listStyleType !== -1) {
                    fontFamily2 = this.createFontStyle(styles)[0];
                    this.ctx.font = fontFamily2;
                    this.ctx.fillStyle = asString(styles.color);
                    this.ctx.textBaseline = "middle";
                    this.ctx.textAlign = "right";
                    bounds = new Bounds(container.bounds.left, container.bounds.top + getAbsoluteValue(container.styles.paddingTop, container.bounds.width), container.bounds.width, computeLineHeight(styles.lineHeight, styles.fontSize.number) / 2 + 1);
                    this.renderTextWithLetterSpacing(new TextBounds(paint.listValue, bounds), styles.letterSpacing, computeLineHeight(styles.lineHeight, styles.fontSize.number) / 2 + 2);
                    this.ctx.textBaseline = "bottom";
                    this.ctx.textAlign = "left";
                  }
                  _c.label = 20;
                case 20:
                  return [
                    2
                    /*return*/
                  ];
              }
            });
          });
        };
        CanvasRenderer2.prototype.renderStackContent = function(stack) {
          return __awaiter(this, void 0, void 0, function() {
            var _i, _a, child, _b, _c, child, _d, _e, child, _f, _g, child, _h, _j, child, _k, _l, child, _m, _o, child;
            return __generator(this, function(_p) {
              switch (_p.label) {
                case 0:
                  if (contains(
                    stack.element.container.flags,
                    16
                    /* DEBUG_RENDER */
                  )) {
                    debugger;
                  }
                  return [4, this.renderNodeBackgroundAndBorders(stack.element)];
                case 1:
                  _p.sent();
                  _i = 0, _a = stack.negativeZIndex;
                  _p.label = 2;
                case 2:
                  if (!(_i < _a.length)) return [3, 5];
                  child = _a[_i];
                  return [4, this.renderStack(child)];
                case 3:
                  _p.sent();
                  _p.label = 4;
                case 4:
                  _i++;
                  return [3, 2];
                case 5:
                  return [4, this.renderNodeContent(stack.element)];
                case 6:
                  _p.sent();
                  _b = 0, _c = stack.nonInlineLevel;
                  _p.label = 7;
                case 7:
                  if (!(_b < _c.length)) return [3, 10];
                  child = _c[_b];
                  return [4, this.renderNode(child)];
                case 8:
                  _p.sent();
                  _p.label = 9;
                case 9:
                  _b++;
                  return [3, 7];
                case 10:
                  _d = 0, _e = stack.nonPositionedFloats;
                  _p.label = 11;
                case 11:
                  if (!(_d < _e.length)) return [3, 14];
                  child = _e[_d];
                  return [4, this.renderStack(child)];
                case 12:
                  _p.sent();
                  _p.label = 13;
                case 13:
                  _d++;
                  return [3, 11];
                case 14:
                  _f = 0, _g = stack.nonPositionedInlineLevel;
                  _p.label = 15;
                case 15:
                  if (!(_f < _g.length)) return [3, 18];
                  child = _g[_f];
                  return [4, this.renderStack(child)];
                case 16:
                  _p.sent();
                  _p.label = 17;
                case 17:
                  _f++;
                  return [3, 15];
                case 18:
                  _h = 0, _j = stack.inlineLevel;
                  _p.label = 19;
                case 19:
                  if (!(_h < _j.length)) return [3, 22];
                  child = _j[_h];
                  return [4, this.renderNode(child)];
                case 20:
                  _p.sent();
                  _p.label = 21;
                case 21:
                  _h++;
                  return [3, 19];
                case 22:
                  _k = 0, _l = stack.zeroOrAutoZIndexOrTransformedOrOpacity;
                  _p.label = 23;
                case 23:
                  if (!(_k < _l.length)) return [3, 26];
                  child = _l[_k];
                  return [4, this.renderStack(child)];
                case 24:
                  _p.sent();
                  _p.label = 25;
                case 25:
                  _k++;
                  return [3, 23];
                case 26:
                  _m = 0, _o = stack.positiveZIndex;
                  _p.label = 27;
                case 27:
                  if (!(_m < _o.length)) return [3, 30];
                  child = _o[_m];
                  return [4, this.renderStack(child)];
                case 28:
                  _p.sent();
                  _p.label = 29;
                case 29:
                  _m++;
                  return [3, 27];
                case 30:
                  return [
                    2
                    /*return*/
                  ];
              }
            });
          });
        };
        CanvasRenderer2.prototype.mask = function(paths) {
          this.ctx.beginPath();
          this.ctx.moveTo(0, 0);
          this.ctx.lineTo(this.canvas.width, 0);
          this.ctx.lineTo(this.canvas.width, this.canvas.height);
          this.ctx.lineTo(0, this.canvas.height);
          this.ctx.lineTo(0, 0);
          this.formatPath(paths.slice(0).reverse());
          this.ctx.closePath();
        };
        CanvasRenderer2.prototype.path = function(paths) {
          this.ctx.beginPath();
          this.formatPath(paths);
          this.ctx.closePath();
        };
        CanvasRenderer2.prototype.formatPath = function(paths) {
          var _this = this;
          paths.forEach(function(point, index) {
            var start = isBezierCurve(point) ? point.start : point;
            if (index === 0) {
              _this.ctx.moveTo(start.x, start.y);
            } else {
              _this.ctx.lineTo(start.x, start.y);
            }
            if (isBezierCurve(point)) {
              _this.ctx.bezierCurveTo(point.startControl.x, point.startControl.y, point.endControl.x, point.endControl.y, point.end.x, point.end.y);
            }
          });
        };
        CanvasRenderer2.prototype.renderRepeat = function(path, pattern, offsetX, offsetY) {
          this.path(path);
          this.ctx.fillStyle = pattern;
          this.ctx.translate(offsetX, offsetY);
          this.ctx.fill();
          this.ctx.translate(-offsetX, -offsetY);
        };
        CanvasRenderer2.prototype.resizeImage = function(image2, width, height) {
          var _a;
          if (image2.width === width && image2.height === height) {
            return image2;
          }
          var ownerDocument = (_a = this.canvas.ownerDocument) !== null && _a !== void 0 ? _a : document;
          var canvas = ownerDocument.createElement("canvas");
          canvas.width = Math.max(1, width);
          canvas.height = Math.max(1, height);
          var ctx = canvas.getContext("2d");
          ctx.drawImage(image2, 0, 0, image2.width, image2.height, 0, 0, width, height);
          return canvas;
        };
        CanvasRenderer2.prototype.renderBackgroundImage = function(container) {
          return __awaiter(this, void 0, void 0, function() {
            var index, _loop_1, this_1, _i, _a, backgroundImage2;
            return __generator(this, function(_b) {
              switch (_b.label) {
                case 0:
                  index = container.styles.backgroundImage.length - 1;
                  _loop_1 = function(backgroundImage3) {
                    var image2, url, _c, path, x, y, width, height, pattern, _d, path, x, y, width, height, _e, lineLength, x0, x1, y0, y1, canvas, ctx, gradient_1, pattern, _f, path, left, top_1, width, height, position2, x, y, _g, rx, ry, radialGradient_1, midX, midY, f2, invF;
                    return __generator(this, function(_h) {
                      switch (_h.label) {
                        case 0:
                          if (!(backgroundImage3.type === 0)) return [3, 5];
                          image2 = void 0;
                          url = backgroundImage3.url;
                          _h.label = 1;
                        case 1:
                          _h.trys.push([1, 3, , 4]);
                          return [4, this_1.context.cache.match(url)];
                        case 2:
                          image2 = _h.sent();
                          return [3, 4];
                        case 3:
                          _h.sent();
                          this_1.context.logger.error("Error loading background-image " + url);
                          return [3, 4];
                        case 4:
                          if (image2) {
                            _c = calculateBackgroundRendering(container, index, [
                              image2.width,
                              image2.height,
                              image2.width / image2.height
                            ]), path = _c[0], x = _c[1], y = _c[2], width = _c[3], height = _c[4];
                            pattern = this_1.ctx.createPattern(this_1.resizeImage(image2, width, height), "repeat");
                            this_1.renderRepeat(path, pattern, x, y);
                          }
                          return [3, 6];
                        case 5:
                          if (isLinearGradient(backgroundImage3)) {
                            _d = calculateBackgroundRendering(container, index, [null, null, null]), path = _d[0], x = _d[1], y = _d[2], width = _d[3], height = _d[4];
                            _e = calculateGradientDirection(backgroundImage3.angle, width, height), lineLength = _e[0], x0 = _e[1], x1 = _e[2], y0 = _e[3], y1 = _e[4];
                            canvas = document.createElement("canvas");
                            canvas.width = width;
                            canvas.height = height;
                            ctx = canvas.getContext("2d");
                            gradient_1 = ctx.createLinearGradient(x0, y0, x1, y1);
                            processColorStops(backgroundImage3.stops, lineLength).forEach(function(colorStop) {
                              return gradient_1.addColorStop(colorStop.stop, asString(colorStop.color));
                            });
                            ctx.fillStyle = gradient_1;
                            ctx.fillRect(0, 0, width, height);
                            if (width > 0 && height > 0) {
                              pattern = this_1.ctx.createPattern(canvas, "repeat");
                              this_1.renderRepeat(path, pattern, x, y);
                            }
                          } else if (isRadialGradient(backgroundImage3)) {
                            _f = calculateBackgroundRendering(container, index, [
                              null,
                              null,
                              null
                            ]), path = _f[0], left = _f[1], top_1 = _f[2], width = _f[3], height = _f[4];
                            position2 = backgroundImage3.position.length === 0 ? [FIFTY_PERCENT] : backgroundImage3.position;
                            x = getAbsoluteValue(position2[0], width);
                            y = getAbsoluteValue(position2[position2.length - 1], height);
                            _g = calculateRadius(backgroundImage3, x, y, width, height), rx = _g[0], ry = _g[1];
                            if (rx > 0 && ry > 0) {
                              radialGradient_1 = this_1.ctx.createRadialGradient(left + x, top_1 + y, 0, left + x, top_1 + y, rx);
                              processColorStops(backgroundImage3.stops, rx * 2).forEach(function(colorStop) {
                                return radialGradient_1.addColorStop(colorStop.stop, asString(colorStop.color));
                              });
                              this_1.path(path);
                              this_1.ctx.fillStyle = radialGradient_1;
                              if (rx !== ry) {
                                midX = container.bounds.left + 0.5 * container.bounds.width;
                                midY = container.bounds.top + 0.5 * container.bounds.height;
                                f2 = ry / rx;
                                invF = 1 / f2;
                                this_1.ctx.save();
                                this_1.ctx.translate(midX, midY);
                                this_1.ctx.transform(1, 0, 0, f2, 0, 0);
                                this_1.ctx.translate(-midX, -midY);
                                this_1.ctx.fillRect(left, invF * (top_1 - midY) + midY, width, height * invF);
                                this_1.ctx.restore();
                              } else {
                                this_1.ctx.fill();
                              }
                            }
                          }
                          _h.label = 6;
                        case 6:
                          index--;
                          return [
                            2
                            /*return*/
                          ];
                      }
                    });
                  };
                  this_1 = this;
                  _i = 0, _a = container.styles.backgroundImage.slice(0).reverse();
                  _b.label = 1;
                case 1:
                  if (!(_i < _a.length)) return [3, 4];
                  backgroundImage2 = _a[_i];
                  return [5, _loop_1(backgroundImage2)];
                case 2:
                  _b.sent();
                  _b.label = 3;
                case 3:
                  _i++;
                  return [3, 1];
                case 4:
                  return [
                    2
                    /*return*/
                  ];
              }
            });
          });
        };
        CanvasRenderer2.prototype.renderSolidBorder = function(color2, side, curvePoints) {
          return __awaiter(this, void 0, void 0, function() {
            return __generator(this, function(_a) {
              this.path(parsePathForBorder(curvePoints, side));
              this.ctx.fillStyle = asString(color2);
              this.ctx.fill();
              return [
                2
                /*return*/
              ];
            });
          });
        };
        CanvasRenderer2.prototype.renderDoubleBorder = function(color2, width, side, curvePoints) {
          return __awaiter(this, void 0, void 0, function() {
            var outerPaths, innerPaths;
            return __generator(this, function(_a) {
              switch (_a.label) {
                case 0:
                  if (!(width < 3)) return [3, 2];
                  return [4, this.renderSolidBorder(color2, side, curvePoints)];
                case 1:
                  _a.sent();
                  return [
                    2
                    /*return*/
                  ];
                case 2:
                  outerPaths = parsePathForBorderDoubleOuter(curvePoints, side);
                  this.path(outerPaths);
                  this.ctx.fillStyle = asString(color2);
                  this.ctx.fill();
                  innerPaths = parsePathForBorderDoubleInner(curvePoints, side);
                  this.path(innerPaths);
                  this.ctx.fill();
                  return [
                    2
                    /*return*/
                  ];
              }
            });
          });
        };
        CanvasRenderer2.prototype.renderNodeBackgroundAndBorders = function(paint) {
          return __awaiter(this, void 0, void 0, function() {
            var styles, hasBackground, borders, backgroundPaintingArea, side, _i, borders_1, border;
            var _this = this;
            return __generator(this, function(_a) {
              switch (_a.label) {
                case 0:
                  this.applyEffects(paint.getEffects(
                    2
                    /* BACKGROUND_BORDERS */
                  ));
                  styles = paint.container.styles;
                  hasBackground = !isTransparent(styles.backgroundColor) || styles.backgroundImage.length;
                  borders = [
                    { style: styles.borderTopStyle, color: styles.borderTopColor, width: styles.borderTopWidth },
                    { style: styles.borderRightStyle, color: styles.borderRightColor, width: styles.borderRightWidth },
                    { style: styles.borderBottomStyle, color: styles.borderBottomColor, width: styles.borderBottomWidth },
                    { style: styles.borderLeftStyle, color: styles.borderLeftColor, width: styles.borderLeftWidth }
                  ];
                  backgroundPaintingArea = calculateBackgroundCurvedPaintingArea(getBackgroundValueForIndex(styles.backgroundClip, 0), paint.curves);
                  if (!(hasBackground || styles.boxShadow.length)) return [3, 2];
                  this.ctx.save();
                  this.path(backgroundPaintingArea);
                  this.ctx.clip();
                  if (!isTransparent(styles.backgroundColor)) {
                    this.ctx.fillStyle = asString(styles.backgroundColor);
                    this.ctx.fill();
                  }
                  return [4, this.renderBackgroundImage(paint.container)];
                case 1:
                  _a.sent();
                  this.ctx.restore();
                  styles.boxShadow.slice(0).reverse().forEach(function(shadow) {
                    _this.ctx.save();
                    var borderBoxArea = calculateBorderBoxPath(paint.curves);
                    var maskOffset = shadow.inset ? 0 : MASK_OFFSET;
                    var shadowPaintingArea = transformPath(borderBoxArea, -maskOffset + (shadow.inset ? 1 : -1) * shadow.spread.number, (shadow.inset ? 1 : -1) * shadow.spread.number, shadow.spread.number * (shadow.inset ? -2 : 2), shadow.spread.number * (shadow.inset ? -2 : 2));
                    if (shadow.inset) {
                      _this.path(borderBoxArea);
                      _this.ctx.clip();
                      _this.mask(shadowPaintingArea);
                    } else {
                      _this.mask(borderBoxArea);
                      _this.ctx.clip();
                      _this.path(shadowPaintingArea);
                    }
                    _this.ctx.shadowOffsetX = shadow.offsetX.number + maskOffset;
                    _this.ctx.shadowOffsetY = shadow.offsetY.number;
                    _this.ctx.shadowColor = asString(shadow.color);
                    _this.ctx.shadowBlur = shadow.blur.number;
                    _this.ctx.fillStyle = shadow.inset ? asString(shadow.color) : "rgba(0,0,0,1)";
                    _this.ctx.fill();
                    _this.ctx.restore();
                  });
                  _a.label = 2;
                case 2:
                  side = 0;
                  _i = 0, borders_1 = borders;
                  _a.label = 3;
                case 3:
                  if (!(_i < borders_1.length)) return [3, 13];
                  border = borders_1[_i];
                  if (!(border.style !== 0 && !isTransparent(border.color) && border.width > 0)) return [3, 11];
                  if (!(border.style === 2)) return [3, 5];
                  return [4, this.renderDashedDottedBorder(
                    border.color,
                    border.width,
                    side,
                    paint.curves,
                    2
                    /* DASHED */
                  )];
                case 4:
                  _a.sent();
                  return [3, 11];
                case 5:
                  if (!(border.style === 3)) return [3, 7];
                  return [4, this.renderDashedDottedBorder(
                    border.color,
                    border.width,
                    side,
                    paint.curves,
                    3
                    /* DOTTED */
                  )];
                case 6:
                  _a.sent();
                  return [3, 11];
                case 7:
                  if (!(border.style === 4)) return [3, 9];
                  return [4, this.renderDoubleBorder(border.color, border.width, side, paint.curves)];
                case 8:
                  _a.sent();
                  return [3, 11];
                case 9:
                  return [4, this.renderSolidBorder(border.color, side, paint.curves)];
                case 10:
                  _a.sent();
                  _a.label = 11;
                case 11:
                  side++;
                  _a.label = 12;
                case 12:
                  _i++;
                  return [3, 3];
                case 13:
                  return [
                    2
                    /*return*/
                  ];
              }
            });
          });
        };
        CanvasRenderer2.prototype.renderDashedDottedBorder = function(color2, width, side, curvePoints, style) {
          return __awaiter(this, void 0, void 0, function() {
            var strokePaths, boxPaths, startX, startY, endX, endY, length, dashLength, spaceLength, useLineDash, multiplier, numberOfDashes, minSpace, maxSpace, path1, path2, path1, path2;
            return __generator(this, function(_a) {
              this.ctx.save();
              strokePaths = parsePathForBorderStroke(curvePoints, side);
              boxPaths = parsePathForBorder(curvePoints, side);
              if (style === 2) {
                this.path(boxPaths);
                this.ctx.clip();
              }
              if (isBezierCurve(boxPaths[0])) {
                startX = boxPaths[0].start.x;
                startY = boxPaths[0].start.y;
              } else {
                startX = boxPaths[0].x;
                startY = boxPaths[0].y;
              }
              if (isBezierCurve(boxPaths[1])) {
                endX = boxPaths[1].end.x;
                endY = boxPaths[1].end.y;
              } else {
                endX = boxPaths[1].x;
                endY = boxPaths[1].y;
              }
              if (side === 0 || side === 2) {
                length = Math.abs(startX - endX);
              } else {
                length = Math.abs(startY - endY);
              }
              this.ctx.beginPath();
              if (style === 3) {
                this.formatPath(strokePaths);
              } else {
                this.formatPath(boxPaths.slice(0, 2));
              }
              dashLength = width < 3 ? width * 3 : width * 2;
              spaceLength = width < 3 ? width * 2 : width;
              if (style === 3) {
                dashLength = width;
                spaceLength = width;
              }
              useLineDash = true;
              if (length <= dashLength * 2) {
                useLineDash = false;
              } else if (length <= dashLength * 2 + spaceLength) {
                multiplier = length / (2 * dashLength + spaceLength);
                dashLength *= multiplier;
                spaceLength *= multiplier;
              } else {
                numberOfDashes = Math.floor((length + spaceLength) / (dashLength + spaceLength));
                minSpace = (length - numberOfDashes * dashLength) / (numberOfDashes - 1);
                maxSpace = (length - (numberOfDashes + 1) * dashLength) / numberOfDashes;
                spaceLength = maxSpace <= 0 || Math.abs(spaceLength - minSpace) < Math.abs(spaceLength - maxSpace) ? minSpace : maxSpace;
              }
              if (useLineDash) {
                if (style === 3) {
                  this.ctx.setLineDash([0, dashLength + spaceLength]);
                } else {
                  this.ctx.setLineDash([dashLength, spaceLength]);
                }
              }
              if (style === 3) {
                this.ctx.lineCap = "round";
                this.ctx.lineWidth = width;
              } else {
                this.ctx.lineWidth = width * 2 + 1.1;
              }
              this.ctx.strokeStyle = asString(color2);
              this.ctx.stroke();
              this.ctx.setLineDash([]);
              if (style === 2) {
                if (isBezierCurve(boxPaths[0])) {
                  path1 = boxPaths[3];
                  path2 = boxPaths[0];
                  this.ctx.beginPath();
                  this.formatPath([new Vector(path1.end.x, path1.end.y), new Vector(path2.start.x, path2.start.y)]);
                  this.ctx.stroke();
                }
                if (isBezierCurve(boxPaths[1])) {
                  path1 = boxPaths[1];
                  path2 = boxPaths[2];
                  this.ctx.beginPath();
                  this.formatPath([new Vector(path1.end.x, path1.end.y), new Vector(path2.start.x, path2.start.y)]);
                  this.ctx.stroke();
                }
              }
              this.ctx.restore();
              return [
                2
                /*return*/
              ];
            });
          });
        };
        CanvasRenderer2.prototype.render = function(element) {
          return __awaiter(this, void 0, void 0, function() {
            var stack;
            return __generator(this, function(_a) {
              switch (_a.label) {
                case 0:
                  if (this.options.backgroundColor) {
                    this.ctx.fillStyle = asString(this.options.backgroundColor);
                    this.ctx.fillRect(this.options.x, this.options.y, this.options.width, this.options.height);
                  }
                  stack = parseStackingContexts(element);
                  return [4, this.renderStack(stack)];
                case 1:
                  _a.sent();
                  this.applyEffects([]);
                  return [2, this.canvas];
              }
            });
          });
        };
        return CanvasRenderer2;
      })(Renderer);
      isTextInputElement = function(container) {
        if (container instanceof TextareaElementContainer) {
          return true;
        } else if (container instanceof SelectElementContainer) {
          return true;
        } else if (container instanceof InputElementContainer && container.type !== RADIO && container.type !== CHECKBOX) {
          return true;
        }
        return false;
      };
      calculateBackgroundCurvedPaintingArea = function(clip, curves) {
        switch (clip) {
          case 0:
            return calculateBorderBoxPath(curves);
          case 2:
            return calculateContentBoxPath(curves);
          case 1:
          default:
            return calculatePaddingBoxPath(curves);
        }
      };
      canvasTextAlign = function(textAlign2) {
        switch (textAlign2) {
          case 1:
            return "center";
          case 2:
            return "right";
          case 0:
          default:
            return "left";
        }
      };
      iOSBrokenFonts = ["-apple-system", "system-ui"];
      fixIOSSystemFonts = function(fontFamilies) {
        return /iPhone OS 15_(0|1)/.test(window.navigator.userAgent) ? fontFamilies.filter(function(fontFamily2) {
          return iOSBrokenFonts.indexOf(fontFamily2) === -1;
        }) : fontFamilies;
      };
      ForeignObjectRenderer = /** @class */
      (function(_super) {
        __extends(ForeignObjectRenderer2, _super);
        function ForeignObjectRenderer2(context, options) {
          var _this = _super.call(this, context, options) || this;
          _this.canvas = options.canvas ? options.canvas : document.createElement("canvas");
          _this.ctx = _this.canvas.getContext("2d");
          _this.options = options;
          _this.canvas.width = Math.floor(options.width * options.scale);
          _this.canvas.height = Math.floor(options.height * options.scale);
          _this.canvas.style.width = options.width + "px";
          _this.canvas.style.height = options.height + "px";
          _this.ctx.scale(_this.options.scale, _this.options.scale);
          _this.ctx.translate(-options.x, -options.y);
          _this.context.logger.debug("EXPERIMENTAL ForeignObject renderer initialized (" + options.width + "x" + options.height + " at " + options.x + "," + options.y + ") with scale " + options.scale);
          return _this;
        }
        ForeignObjectRenderer2.prototype.render = function(element) {
          return __awaiter(this, void 0, void 0, function() {
            var svg, img;
            return __generator(this, function(_a) {
              switch (_a.label) {
                case 0:
                  svg = createForeignObjectSVG(this.options.width * this.options.scale, this.options.height * this.options.scale, this.options.scale, this.options.scale, element);
                  return [4, loadSerializedSVG(svg)];
                case 1:
                  img = _a.sent();
                  if (this.options.backgroundColor) {
                    this.ctx.fillStyle = asString(this.options.backgroundColor);
                    this.ctx.fillRect(0, 0, this.options.width * this.options.scale, this.options.height * this.options.scale);
                  }
                  this.ctx.drawImage(img, -this.options.x * this.options.scale, -this.options.y * this.options.scale);
                  return [2, this.canvas];
              }
            });
          });
        };
        return ForeignObjectRenderer2;
      })(Renderer);
      loadSerializedSVG = function(svg) {
        return new Promise(function(resolve, reject) {
          var img = new Image();
          img.onload = function() {
            resolve(img);
          };
          img.onerror = reject;
          img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(svg));
        });
      };
      Logger = /** @class */
      (function() {
        function Logger2(_a) {
          var id = _a.id, enabled = _a.enabled;
          this.id = id;
          this.enabled = enabled;
          this.start = Date.now();
        }
        Logger2.prototype.debug = function() {
          var args = [];
          for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
          }
          if (this.enabled) {
            if (typeof window !== "undefined" && window.console && typeof console.debug === "function") {
              console.debug.apply(console, __spreadArray([this.id, this.getTime() + "ms"], args));
            } else {
              this.info.apply(this, args);
            }
          }
        };
        Logger2.prototype.getTime = function() {
          return Date.now() - this.start;
        };
        Logger2.prototype.info = function() {
          var args = [];
          for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
          }
          if (this.enabled) {
            if (typeof window !== "undefined" && window.console && typeof console.info === "function") {
              console.info.apply(console, __spreadArray([this.id, this.getTime() + "ms"], args));
            }
          }
        };
        Logger2.prototype.warn = function() {
          var args = [];
          for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
          }
          if (this.enabled) {
            if (typeof window !== "undefined" && window.console && typeof console.warn === "function") {
              console.warn.apply(console, __spreadArray([this.id, this.getTime() + "ms"], args));
            } else {
              this.info.apply(this, args);
            }
          }
        };
        Logger2.prototype.error = function() {
          var args = [];
          for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
          }
          if (this.enabled) {
            if (typeof window !== "undefined" && window.console && typeof console.error === "function") {
              console.error.apply(console, __spreadArray([this.id, this.getTime() + "ms"], args));
            } else {
              this.info.apply(this, args);
            }
          }
        };
        Logger2.instances = {};
        return Logger2;
      })();
      Context = /** @class */
      (function() {
        function Context2(options, windowBounds) {
          var _a;
          this.windowBounds = windowBounds;
          this.instanceName = "#" + Context2.instanceCount++;
          this.logger = new Logger({ id: this.instanceName, enabled: options.logging });
          this.cache = (_a = options.cache) !== null && _a !== void 0 ? _a : new Cache(this, options);
        }
        Context2.instanceCount = 1;
        return Context2;
      })();
      html2canvas = function(element, options) {
        if (options === void 0) {
          options = {};
        }
        return renderElement(element, options);
      };
      if (typeof window !== "undefined") {
        CacheStorage.setContext(window);
      }
      renderElement = function(element, opts) {
        return __awaiter(void 0, void 0, void 0, function() {
          var ownerDocument, defaultView, resourceOptions, contextOptions, windowOptions, windowBounds, context, foreignObjectRendering, cloneOptions, documentCloner, clonedElement, container, _a, width, height, left, top, backgroundColor2, renderOptions, canvas, renderer, root, renderer;
          var _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t;
          return __generator(this, function(_u) {
            switch (_u.label) {
              case 0:
                if (!element || typeof element !== "object") {
                  return [2, Promise.reject("Invalid element provided as first argument")];
                }
                ownerDocument = element.ownerDocument;
                if (!ownerDocument) {
                  throw new Error("Element is not attached to a Document");
                }
                defaultView = ownerDocument.defaultView;
                if (!defaultView) {
                  throw new Error("Document is not attached to a Window");
                }
                resourceOptions = {
                  allowTaint: (_b = opts.allowTaint) !== null && _b !== void 0 ? _b : false,
                  imageTimeout: (_c = opts.imageTimeout) !== null && _c !== void 0 ? _c : 15e3,
                  proxy: opts.proxy,
                  useCORS: (_d = opts.useCORS) !== null && _d !== void 0 ? _d : false
                };
                contextOptions = __assign({ logging: (_e = opts.logging) !== null && _e !== void 0 ? _e : true, cache: opts.cache }, resourceOptions);
                windowOptions = {
                  windowWidth: (_f = opts.windowWidth) !== null && _f !== void 0 ? _f : defaultView.innerWidth,
                  windowHeight: (_g = opts.windowHeight) !== null && _g !== void 0 ? _g : defaultView.innerHeight,
                  scrollX: (_h = opts.scrollX) !== null && _h !== void 0 ? _h : defaultView.pageXOffset,
                  scrollY: (_j = opts.scrollY) !== null && _j !== void 0 ? _j : defaultView.pageYOffset
                };
                windowBounds = new Bounds(windowOptions.scrollX, windowOptions.scrollY, windowOptions.windowWidth, windowOptions.windowHeight);
                context = new Context(contextOptions, windowBounds);
                foreignObjectRendering = (_k = opts.foreignObjectRendering) !== null && _k !== void 0 ? _k : false;
                cloneOptions = {
                  allowTaint: (_l = opts.allowTaint) !== null && _l !== void 0 ? _l : false,
                  onclone: opts.onclone,
                  ignoreElements: opts.ignoreElements,
                  inlineImages: foreignObjectRendering,
                  copyStyles: foreignObjectRendering
                };
                context.logger.debug("Starting document clone with size " + windowBounds.width + "x" + windowBounds.height + " scrolled to " + -windowBounds.left + "," + -windowBounds.top);
                documentCloner = new DocumentCloner(context, element, cloneOptions);
                clonedElement = documentCloner.clonedReferenceElement;
                if (!clonedElement) {
                  return [2, Promise.reject("Unable to find element in cloned iframe")];
                }
                return [4, documentCloner.toIFrame(ownerDocument, windowBounds)];
              case 1:
                container = _u.sent();
                _a = isBodyElement(clonedElement) || isHTMLElement(clonedElement) ? parseDocumentSize(clonedElement.ownerDocument) : parseBounds(context, clonedElement), width = _a.width, height = _a.height, left = _a.left, top = _a.top;
                backgroundColor2 = parseBackgroundColor(context, clonedElement, opts.backgroundColor);
                renderOptions = {
                  canvas: opts.canvas,
                  backgroundColor: backgroundColor2,
                  scale: (_o = (_m = opts.scale) !== null && _m !== void 0 ? _m : defaultView.devicePixelRatio) !== null && _o !== void 0 ? _o : 1,
                  x: ((_p = opts.x) !== null && _p !== void 0 ? _p : 0) + left,
                  y: ((_q = opts.y) !== null && _q !== void 0 ? _q : 0) + top,
                  width: (_r = opts.width) !== null && _r !== void 0 ? _r : Math.ceil(width),
                  height: (_s = opts.height) !== null && _s !== void 0 ? _s : Math.ceil(height)
                };
                if (!foreignObjectRendering) return [3, 3];
                context.logger.debug("Document cloned, using foreign object rendering");
                renderer = new ForeignObjectRenderer(context, renderOptions);
                return [4, renderer.render(clonedElement)];
              case 2:
                canvas = _u.sent();
                return [3, 5];
              case 3:
                context.logger.debug("Document cloned, element located at " + left + "," + top + " with size " + width + "x" + height + " using computed rendering");
                context.logger.debug("Starting DOM parsing");
                root = parseTree(context, clonedElement);
                if (backgroundColor2 === root.styles.backgroundColor) {
                  root.styles.backgroundColor = COLORS.TRANSPARENT;
                }
                context.logger.debug("Starting renderer for element at " + renderOptions.x + "," + renderOptions.y + " with size " + renderOptions.width + "x" + renderOptions.height);
                renderer = new CanvasRenderer(context, renderOptions);
                return [4, renderer.render(root)];
              case 4:
                canvas = _u.sent();
                _u.label = 5;
              case 5:
                if ((_t = opts.removeContainer) !== null && _t !== void 0 ? _t : true) {
                  if (!DocumentCloner.destroy(container)) {
                    context.logger.error("Cannot detach cloned iframe as it is not in the DOM anymore");
                  }
                }
                context.logger.debug("Finished rendering");
                return [2, canvas];
            }
          });
        });
      };
      parseBackgroundColor = function(context, element, backgroundColorOverride) {
        var ownerDocument = element.ownerDocument;
        var documentBackgroundColor = ownerDocument.documentElement ? parseColor(context, getComputedStyle(ownerDocument.documentElement).backgroundColor) : COLORS.TRANSPARENT;
        var bodyBackgroundColor = ownerDocument.body ? parseColor(context, getComputedStyle(ownerDocument.body).backgroundColor) : COLORS.TRANSPARENT;
        var defaultBackgroundColor = typeof backgroundColorOverride === "string" ? parseColor(context, backgroundColorOverride) : backgroundColorOverride === null ? COLORS.TRANSPARENT : 4294967295;
        return element === ownerDocument.documentElement ? isTransparent(documentBackgroundColor) ? isTransparent(bodyBackgroundColor) ? defaultBackgroundColor : bodyBackgroundColor : documentBackgroundColor : defaultBackgroundColor;
      };
      html2canvas_esm_default = html2canvas;
    }
  });

  // src/screenshot.ts
  function loadHtml2Canvas() {
    if (_html2canvasPromise) return _html2canvasPromise;
    _html2canvasPromise = Promise.resolve().then(() => (init_html2canvas_esm(), html2canvas_esm_exports)).then((mod) => {
      const fn = mod.default || mod;
      return typeof fn === "function" ? fn : null;
    }).catch(() => null);
    return _html2canvasPromise;
  }
  function isExtensionContext() {
    return !!window.__TRACEBUG_INITIALIZED__;
  }
  function captureViaExtension() {
    return new Promise((resolve) => {
      const handler = (e2) => {
        var _a;
        window.removeEventListener("tracebug-ext-screenshot-result", handler);
        const dataUrl = (_a = e2.detail) == null ? void 0 : _a.dataUrl;
        resolve(dataUrl || null);
      };
      window.addEventListener("tracebug-ext-screenshot-result", handler);
      window.dispatchEvent(new CustomEvent("tracebug-request-screenshot"));
      setTimeout(() => {
        window.removeEventListener("tracebug-ext-screenshot-result", handler);
        resolve(null);
      }, 3e3);
    });
  }
  function getScreenshots() {
    return [...screenshots];
  }
  function clearScreenshots() {
    screenshots.length = 0;
    screenshotCounter = 0;
  }
  async function captureScreenshot(lastEvent, options) {
    var _a, _b;
    screenshotCounter++;
    const includeAnnotations = (_a = options == null ? void 0 : options.includeAnnotations) != null ? _a : false;
    const eventContext = lastEvent ? buildEventLabel(lastEvent) : includeAnnotations ? "annotated_capture" : "manual_capture";
    const filename = `${String(screenshotCounter).padStart(2, "0")}_${sanitizeFilename(eventContext)}.png`;
    const root = document.getElementById("tracebug-root");
    const hiddenEls = [];
    if (root) {
      if (includeAnnotations) {
        for (const child of Array.from(root.children)) {
          const tag = ((_b = child.dataset) == null ? void 0 : _b.tracebug) || child.id || "";
          const isAnnotation = tag === "annotation-badge" || tag === "annotation-outline";
          if (!isAnnotation) {
            child.style.display = "none";
            hiddenEls.push(child);
          }
        }
      } else {
        root.style.display = "none";
      }
    }
    let dataUrl;
    let width = window.innerWidth;
    let height = window.innerHeight;
    try {
      if (isExtensionContext()) {
        const extDataUrl = await captureViaExtension();
        if (extDataUrl) {
          dataUrl = extDataUrl;
        } else {
          dataUrl = await captureViaCanvas();
        }
      } else {
        const renderer = await loadHtml2Canvas();
        if (renderer) {
          const canvas = await renderer(document.body, {
            useCORS: true,
            allowTaint: true,
            scale: 1,
            logging: false,
            width: window.innerWidth,
            height: window.innerHeight,
            windowWidth: window.innerWidth,
            windowHeight: window.innerHeight,
            ignoreElements: (el) => {
              var _a2, _b2;
              if (includeAnnotations) {
                const tbAttr = ((_a2 = el.dataset) == null ? void 0 : _a2.tracebug) || "";
                if (tbAttr === "annotation-badge" || tbAttr === "annotation-outline") return false;
                if (hiddenEls.includes(el)) return true;
                if (el.id === "tracebug-root") return false;
                if (tbAttr) return true;
              } else {
                if (el.id === "tracebug-root") return true;
                if ((_b2 = el.dataset) == null ? void 0 : _b2.tracebug) return true;
              }
              return false;
            }
          });
          dataUrl = canvas.toDataURL("image/png", 0.8);
          width = canvas.width;
          height = canvas.height;
        } else {
          dataUrl = await captureViaCanvas();
        }
      }
    } catch (err) {
      console.warn("[TraceBug] Screenshot capture error:", err);
      dataUrl = await captureViaCanvas();
    }
    if (includeAnnotations) {
      hiddenEls.forEach((el) => el.style.display = "");
    } else {
      if (root) root.style.display = "";
    }
    const screenshot = {
      id: `ss_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      dataUrl,
      filename,
      eventContext,
      page: window.location.pathname,
      width,
      height
    };
    screenshots.push(screenshot);
    if (screenshots.length > MAX_SCREENSHOTS) {
      screenshots.splice(0, screenshots.length - MAX_SCREENSHOTS);
    }
    return screenshot;
  }
  async function captureViaCanvas() {
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 200;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, 400, 200);
    ctx.fillStyle = "#e0e0e0";
    ctx.font = "14px monospace";
    ctx.fillText("Screenshot (html2canvas unavailable)", 20, 40);
    ctx.fillStyle = "#888";
    ctx.font = "12px monospace";
    ctx.fillText(`Page: ${window.location.pathname}`, 20, 70);
    ctx.fillText(`Time: ${(/* @__PURE__ */ new Date()).toLocaleTimeString()}`, 20, 90);
    ctx.fillText(`Viewport: ${window.innerWidth}x${window.innerHeight}`, 20, 110);
    return canvas.toDataURL("image/png");
  }
  function buildEventLabel(event) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    switch (event.type) {
      case "click": {
        const el = event.data.element;
        const target = ((_a = el == null ? void 0 : el.text) == null ? void 0 : _a.trim()) || (el == null ? void 0 : el.id) || (el == null ? void 0 : el.ariaLabel) || (el == null ? void 0 : el.tag) || "element";
        return `click_${target}`;
      }
      case "input": {
        const name = ((_b = event.data.element) == null ? void 0 : _b.name) || ((_c = event.data.element) == null ? void 0 : _c.id) || "field";
        return `enter_${name}`;
      }
      case "select_change": {
        const name = ((_d = event.data.element) == null ? void 0 : _d.name) || "dropdown";
        const val = ((_e = event.data.element) == null ? void 0 : _e.selectedText) || "";
        return `select_${name}_${val}`;
      }
      case "form_submit":
        return `submit_${((_f = event.data.form) == null ? void 0 : _f.id) || "form"}`;
      case "route_change":
        return `navigate_${event.data.to || "page"}`;
      case "api_request":
        return `api_${(_g = event.data.request) == null ? void 0 : _g.method}_${(_h = event.data.request) == null ? void 0 : _h.statusCode}`;
      case "error":
      case "unhandled_rejection":
        return "error_occurred";
      default:
        return event.type;
    }
  }
  function downloadAllScreenshots() {
    for (const ss of screenshots) {
      downloadDataUrl(ss.dataUrl, ss.filename);
    }
  }
  function downloadScreenshot(dataUrl, filename) {
    downloadDataUrl(dataUrl, filename);
  }
  function downloadDataUrl(dataUrl, filename) {
    const a2 = document.createElement("a");
    a2.href = dataUrl;
    a2.download = filename;
    document.body.appendChild(a2);
    a2.click();
    document.body.removeChild(a2);
  }
  function sanitizeFilename(str) {
    return str.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").slice(0, 50);
  }
  var _html2canvasPromise, MAX_SCREENSHOTS, screenshotCounter, screenshots;
  var init_screenshot = __esm({
    "src/screenshot.ts"() {
      "use strict";
      _html2canvasPromise = null;
      MAX_SCREENSHOTS = 50;
      screenshotCounter = 0;
      screenshots = [];
    }
  });

  // src/collectors.ts
  function pushNetworkFailure(failure) {
    try {
      _networkFailures.push(failure);
      if (_networkFailures.length > NETWORK_FAILURE_LIMIT) {
        _networkFailures.splice(0, _networkFailures.length - NETWORK_FAILURE_LIMIT);
      }
    } catch (e2) {
    }
  }
  function getNetworkFailures() {
    return _networkFailures.slice();
  }
  function clearNetworkFailures() {
    _networkFailures.length = 0;
  }
  function sanitizeUrl(url) {
    if (!url) return url;
    try {
      const qIdx = url.indexOf("?");
      if (qIdx === -1) return url;
      const base = url.slice(0, qIdx);
      const afterQ = url.slice(qIdx + 1);
      const hashIdx = afterQ.indexOf("#");
      const query = hashIdx === -1 ? afterQ : afterQ.slice(0, hashIdx);
      const hash = hashIdx === -1 ? "" : afterQ.slice(hashIdx);
      const redacted = query.split("&").map((part) => {
        const eqIdx = part.indexOf("=");
        if (eqIdx === -1) return part;
        const key = part.slice(0, eqIdx);
        if (SENSITIVE_PARAM_RE.test(key)) return `${key}=[REDACTED]`;
        return part;
      }).join("&");
      return `${base}?${redacted}${hash}`;
    } catch (e2) {
      return url;
    }
  }
  async function readResponseBodySafe(response) {
    try {
      const ct = response.headers.get("content-type") || "";
      if (BINARY_CONTENT_TYPE_RE.test(ct)) return "";
      if (!response.body || typeof response.body.getReader !== "function") {
        try {
          const text = await response.text();
          return typeof text === "string" ? text.slice(0, RESPONSE_SNIPPET_CHARS) : "";
        } catch (e2) {
          return "";
        }
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8", { fatal: false });
      let collected = "";
      let bytesRead = 0;
      while (bytesRead < MAX_BODY_BYTES && collected.length < RESPONSE_SNIPPET_CHARS) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          bytesRead += value.byteLength;
          collected += decoder.decode(value, { stream: true });
        }
      }
      try {
        await reader.cancel();
      } catch (e2) {
      }
      return collected.slice(0, RESPONSE_SNIPPET_CHARS);
    } catch (e2) {
      return "";
    }
  }
  function isInternalUrl(url) {
    return INTERNAL_URL_PATTERNS.some((pattern) => pattern.test(url));
  }
  function getRoot() {
    if (_rootCache === void 0) {
      _rootCache = document.getElementById(ROOT_ID);
    }
    if (_rootCache && !_rootCache.isConnected) {
      _rootCache = document.getElementById(ROOT_ID);
    }
    return _rootCache;
  }
  function isTraceBugElement(el) {
    if (!el) return false;
    if (el.id === ROOT_ID || el.id === BTN_ID || el.id === PANEL_ID) return true;
    if (el.dataset && el.dataset.tracebug) return true;
    const root = getRoot();
    if (root && root.contains(el)) return true;
    let node = el;
    while (node) {
      const id = node.id || "";
      if (id.startsWith("tracebug-") || id.startsWith("bt-")) return true;
      const cn = typeof node.className === "string" ? node.className : "";
      if (cn.includes("tracebug-") || cn.includes("bt-ann") || cn.includes("bt-voice")) return true;
      if (node.dataset && node.dataset.tracebug) return true;
      node = node.parentElement;
    }
    return false;
  }
  function collectClicks(emit) {
    const handler = (e2) => {
      try {
        const t = e2.target;
        if (!t || isTraceBugElement(t)) return;
        const tag = t.tagName.toLowerCase();
        const data = {
          element: {
            tag,
            text: (t.innerText || "").slice(0, 120),
            id: t.id || "",
            className: typeof t.className === "string" ? t.className : ""
          }
        };
        const el = data.element;
        if (tag === "a") el.href = t.href || "";
        if (tag === "button" || t.type === "submit") {
          el.buttonType = t.type || "button";
          el.disabled = t.disabled;
        }
        if (tag === "label") el.forField = t.htmlFor || "";
        const ariaLabel = t.getAttribute("aria-label");
        if (ariaLabel) el.ariaLabel = ariaLabel;
        const role = t.getAttribute("role");
        if (role) el.role = role;
        const testId = t.getAttribute("data-testid");
        if (testId) el.testId = testId;
        const form = t.closest("form");
        if (form) {
          el.formId = form.id || "";
          el.formAction = form.action || "";
        }
        try {
          el.selector = buildSelector(t);
        } catch (e3) {
        }
        try {
          const r = t.getBoundingClientRect();
          el.boundingBox = { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
        } catch (e3) {
        }
        emit("click", data);
      } catch (err) {
        if (typeof console !== "undefined") console.warn("[TraceBug] Click capture error:", err);
      }
    };
    document.addEventListener("click", handler, { capture: true });
    return () => document.removeEventListener("click", handler, { capture: true });
  }
  function buildSelector(el) {
    if (!el) return "";
    if (el.id) return `#${CSS.escape(el.id)}`;
    const testId = el.getAttribute("data-testid");
    if (testId) return `[data-testid="${testId}"]`;
    const parts = [];
    let node = el;
    let depth = 0;
    while (node && node !== document.body && depth < 4) {
      let part = node.tagName.toLowerCase();
      if (node.id) {
        parts.unshift(`#${CSS.escape(node.id)}`);
        break;
      }
      const cls = typeof node.className === "string" ? node.className.trim().split(/\s+/).filter(Boolean)[0] : "";
      if (cls) part += `.${CSS.escape(cls)}`;
      const parent = node.parentElement;
      const currentTag = node.tagName;
      const currentNode = node;
      if (parent) {
        const sameTag = Array.from(parent.children).filter((c) => c.tagName === currentTag);
        if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(currentNode) + 1})`;
      }
      parts.unshift(part);
      node = parent;
      depth++;
    }
    return parts.join(" > ");
  }
  function collectInputs(emit) {
    const timers = /* @__PURE__ */ new Map();
    const handler = (e2) => {
      try {
        const t = e2.target;
        if (!t || !("value" in t) || isTraceBugElement(t)) return;
        if (t.tagName.toLowerCase() === "select") return;
        const prev = timers.get(t);
        if (prev) clearTimeout(prev);
        timers.set(
          t,
          setTimeout(() => {
            try {
              const tag = t.tagName.toLowerCase();
              const inputType = t.type || "";
              const isSensitive = ["password", "credit-card", "ssn"].includes(inputType) || /password|secret|token|ssn|credit/i.test(t.name || t.id || "");
              const data = {
                element: {
                  tag,
                  name: t.name || t.id || "",
                  type: inputType,
                  valueLength: (t.value || "").length,
                  value: isSensitive ? "[REDACTED]" : (t.value || "").slice(0, 200),
                  placeholder: t.placeholder || ""
                }
              };
              if (inputType === "checkbox" || inputType === "radio") {
                data.element.checked = t.checked;
                data.element.value = t.checked ? "checked" : "unchecked";
              }
              if (inputType === "number" || inputType === "range") {
                data.element.value = t.value;
              }
              emit("input", data);
            } catch (err) {
              if (typeof console !== "undefined") console.warn("[TraceBug] Input capture error:", err);
            }
            timers.delete(t);
          }, 300)
        );
      } catch (err) {
        if (typeof console !== "undefined") console.warn("[TraceBug] Input capture error:", err);
      }
    };
    document.addEventListener("input", handler, { capture: true });
    return () => {
      document.removeEventListener("input", handler, { capture: true });
      timers.forEach((t) => clearTimeout(t));
    };
  }
  function collectSelectChanges(emit) {
    const handler = (e2) => {
      try {
        const t = e2.target;
        if (!t || t.tagName.toLowerCase() !== "select" || isTraceBugElement(t)) return;
        const selectedOption = t.options[t.selectedIndex];
        emit("select_change", {
          element: {
            tag: "select",
            name: t.name || t.id || "",
            value: t.value,
            selectedText: selectedOption ? selectedOption.text : "",
            selectedIndex: t.selectedIndex,
            optionCount: t.options.length,
            allOptions: Array.from(t.options).map((o) => o.text).slice(0, 20)
          }
        });
      } catch (err) {
        if (typeof console !== "undefined") console.warn("[TraceBug] Select capture error:", err);
      }
    };
    document.addEventListener("change", handler, { capture: true });
    return () => document.removeEventListener("change", handler, { capture: true });
  }
  function collectFormSubmits(emit) {
    const handler = (e2) => {
      try {
        const form = e2.target;
        if (!form || form.tagName.toLowerCase() !== "form" || isTraceBugElement(form)) return;
        const formData = {};
        const elements = form.elements;
        for (let i = 0; i < elements.length; i++) {
          const el = elements[i];
          if (!el.name) continue;
          const isSensitive = ["password"].includes(el.type) || /password|secret|token|ssn|credit/i.test(el.name);
          if (el.type === "submit" || el.type === "button") continue;
          formData[el.name] = isSensitive ? "[REDACTED]" : (el.value || "").slice(0, 200);
        }
        emit("form_submit", {
          form: { id: form.id || "", action: form.action || "", method: form.method || "GET", fieldCount: elements.length, fields: formData }
        });
      } catch (err) {
        if (typeof console !== "undefined") console.warn("[TraceBug] Form capture error:", err);
      }
    };
    document.addEventListener("submit", handler, { capture: true });
    return () => document.removeEventListener("submit", handler, { capture: true });
  }
  function collectRouteChanges(emit) {
    let lastPath = window.location.pathname;
    const check = () => {
      const current = window.location.pathname;
      if (current !== lastPath) {
        const from = lastPath;
        lastPath = current;
        emit("route_change", { from, to: current });
      }
    };
    window.addEventListener("popstate", check);
    const origPush = history.pushState.bind(history);
    const origReplace = history.replaceState.bind(history);
    history.pushState = function(...args) {
      origPush(...args);
      check();
    };
    history.replaceState = function(...args) {
      origReplace(...args);
      check();
    };
    return () => {
      window.removeEventListener("popstate", check);
      history.pushState = origPush;
      history.replaceState = origReplace;
    };
  }
  function collectApiRequests(emit) {
    const originalFetch = window.fetch;
    window.fetch = async function(input, init) {
      var _a;
      let url = "";
      let method = "GET";
      try {
        if (typeof input === "string") {
          url = input;
        } else if (input instanceof URL) {
          url = input.href;
        } else if (input && typeof input === "object" && "url" in input) {
          url = input.url;
          method = input.method || "GET";
        }
        if (init == null ? void 0 : init.method) method = init.method;
      } catch (e2) {
      }
      const start = Date.now();
      try {
        if (url && isInternalUrl(url)) return originalFetch.call(window, input, init);
      } catch (e2) {
      }
      const safeUrl = sanitizeUrl(url).slice(0, 500);
      try {
        const response = await originalFetch.call(window, input, init);
        try {
          emit("api_request", {
            request: { url: safeUrl, method: method.toUpperCase(), statusCode: response.status, durationMs: Date.now() - start }
          });
        } catch (e2) {
        }
        try {
          if (response.status >= 400 || response.status === 0) {
            const clone = response.clone();
            readResponseBodySafe(clone).then((snippet) => {
              pushNetworkFailure({
                url: safeUrl,
                method: method.toUpperCase(),
                status: response.status,
                response: snippet,
                timestamp: Date.now()
              });
            }).catch(() => {
              pushNetworkFailure({
                url: safeUrl,
                method: method.toUpperCase(),
                status: response.status,
                response: "",
                timestamp: Date.now()
              });
            });
          }
        } catch (e2) {
        }
        return response;
      } catch (err) {
        try {
          emit("api_request", {
            request: { url: safeUrl, method: method.toUpperCase(), statusCode: 0, durationMs: Date.now() - start }
          });
        } catch (e2) {
        }
        try {
          pushNetworkFailure({
            url: safeUrl,
            method: method.toUpperCase(),
            status: 0,
            response: ((_a = err == null ? void 0 : err.message) == null ? void 0 : _a.slice(0, RESPONSE_SNIPPET_CHARS)) || "",
            timestamp: Date.now()
          });
        } catch (e2) {
        }
        throw err;
      }
    };
    return () => {
      window.fetch = originalFetch;
    };
  }
  function collectXhrRequests(emit) {
    const OrigXHR = window.XMLHttpRequest;
    const origOpen = OrigXHR.prototype.open;
    const origSend = OrigXHR.prototype.send;
    const xhrMeta = /* @__PURE__ */ new WeakMap();
    OrigXHR.prototype.open = function(method, url, ...rest) {
      try {
        xhrMeta.set(this, { method, url: typeof url === "string" ? url : url.toString() });
      } catch (e2) {
      }
      return origOpen.apply(this, [method, url, ...rest]);
    };
    OrigXHR.prototype.send = function(body) {
      try {
        const xhr = this;
        const start = Date.now();
        const meta = xhrMeta.get(xhr);
        const method = (meta == null ? void 0 : meta.method) || "GET";
        const url = (meta == null ? void 0 : meta.url) || "";
        if (isInternalUrl(url)) return origSend.call(this, body);
        const safeUrl = sanitizeUrl(url).slice(0, 500);
        xhr.addEventListener("loadend", function() {
          try {
            emit("api_request", { request: { url: safeUrl, method: method.toUpperCase(), statusCode: xhr.status, durationMs: Date.now() - start } });
          } catch (e2) {
          }
          try {
            if (xhr.status >= 400 || xhr.status === 0) {
              let body2 = "";
              try {
                const ct = xhr.getResponseHeader && xhr.getResponseHeader("content-type") || "";
                if (!BINARY_CONTENT_TYPE_RE.test(ct)) {
                  body2 = typeof xhr.responseText === "string" ? xhr.responseText : "";
                }
              } catch (e2) {
              }
              pushNetworkFailure({
                url: safeUrl,
                method: method.toUpperCase(),
                status: xhr.status,
                response: body2.slice(0, RESPONSE_SNIPPET_CHARS),
                timestamp: Date.now()
              });
            }
          } catch (e2) {
          }
        });
        xhr.addEventListener("error", function() {
          try {
            emit("api_request", { request: { url: safeUrl, method: method.toUpperCase(), statusCode: 0, durationMs: Date.now() - start } });
          } catch (e2) {
          }
          try {
            pushNetworkFailure({
              url: safeUrl,
              method: method.toUpperCase(),
              status: 0,
              response: "",
              timestamp: Date.now()
            });
          } catch (e2) {
          }
        });
      } catch (err) {
        if (typeof console !== "undefined") console.warn("[TraceBug] XHR capture error:", err);
      }
      return origSend.call(this, body);
    };
    return () => {
      OrigXHR.prototype.open = origOpen;
      OrigXHR.prototype.send = origSend;
    };
  }
  function collectErrors(emit) {
    const prevOnError = window.onerror;
    window.onerror = (msg, source, line, col, error) => {
      try {
        emit("error", {
          error: {
            message: typeof msg === "string" ? msg : "Unknown error",
            stack: error == null ? void 0 : error.stack,
            source,
            line,
            column: col
          }
        });
      } catch (e2) {
      }
      if (prevOnError) {
        try {
          prevOnError(msg, source, line, col, error);
        } catch (e2) {
        }
      }
    };
    const onRejection = (e2) => {
      var _a, _b;
      try {
        emit("unhandled_rejection", {
          error: { message: ((_a = e2.reason) == null ? void 0 : _a.message) || String(e2.reason), stack: (_b = e2.reason) == null ? void 0 : _b.stack }
        });
      } catch (e3) {
      }
    };
    window.addEventListener("unhandledrejection", onRejection);
    const origConsoleError = console.error;
    let _insideEmit = false;
    console.error = function(...args) {
      if (_insideEmit) {
        origConsoleError.apply(console, args);
        return;
      }
      _insideEmit = true;
      try {
        emit("console_error", {
          error: { message: args.map((a2) => typeof a2 === "string" ? a2 : JSON.stringify(a2)).join(" ") }
        });
      } catch (e2) {
      } finally {
        _insideEmit = false;
      }
      origConsoleError.apply(console, args);
    };
    return () => {
      window.onerror = prevOnError;
      window.removeEventListener("unhandledrejection", onRejection);
      console.error = origConsoleError;
    };
  }
  function collectConsoleWarnings(emit) {
    const origWarn = console.warn;
    let _inside = false;
    console.warn = function(...args) {
      if (_inside) {
        origWarn.apply(console, args);
        return;
      }
      _inside = true;
      try {
        emit("console_warn", {
          error: { message: args.map((a2) => typeof a2 === "string" ? a2 : JSON.stringify(a2)).join(" ") }
        });
      } catch (e2) {
      } finally {
        _inside = false;
      }
      origWarn.apply(console, args);
    };
    return () => {
      console.warn = origWarn;
    };
  }
  function collectConsoleLogs(emit) {
    const origLog = console.log;
    let _inside = false;
    let _count = 0;
    console.log = function(...args) {
      if (_inside || _count >= 50) {
        origLog.apply(console, args);
        return;
      }
      _inside = true;
      _count++;
      try {
        emit("console_log", {
          error: { message: args.map((a2) => typeof a2 === "string" ? a2 : JSON.stringify(a2)).join(" ") }
        });
      } catch (e2) {
      } finally {
        _inside = false;
      }
      origLog.apply(console, args);
    };
    return () => {
      console.log = origLog;
    };
  }
  var ROOT_ID, PANEL_ID, BTN_ID, NETWORK_FAILURE_LIMIT, RESPONSE_SNIPPET_CHARS, _networkFailures, SENSITIVE_PARAM_RE, MAX_BODY_BYTES, BINARY_CONTENT_TYPE_RE, INTERNAL_URL_PATTERNS, _rootCache;
  var init_collectors = __esm({
    "src/collectors.ts"() {
      "use strict";
      ROOT_ID = "tracebug-root";
      PANEL_ID = "tracebug-dashboard-panel";
      BTN_ID = "tracebug-dashboard-btn";
      NETWORK_FAILURE_LIMIT = 10;
      RESPONSE_SNIPPET_CHARS = 200;
      _networkFailures = [];
      SENSITIVE_PARAM_RE = /token|key|secret|auth|password|sig|signature/i;
      MAX_BODY_BYTES = 10 * 1024;
      BINARY_CONTENT_TYPE_RE = /^(image|video|audio)\/|^application\/(octet-stream|pdf|zip|x-protobuf|x-msgpack|wasm|vnd\.)/i;
      INTERNAL_URL_PATTERNS = [
        /__nextjs_original-stack-frame/,
        /\/_next\/static\/webpack/,
        /\/__webpack_hmr/,
        /\.hot-update\./,
        /\/sockjs-node\//,
        /\/turbopack-hmr\//,
        /\/_next\/webpack-hmr/,
        /\/webpack-dev-server\//,
        /\/__vite_ping/,
        /\/@vite\/client/,
        /\/@react-refresh/
      ];
    }
  });

  // src/environment.ts
  function captureEnvironment() {
    const ua = navigator.userAgent;
    const browser = detectBrowser(ua);
    const os = detectOS(ua);
    const deviceType = detectDeviceType();
    const connection = getConnectionType();
    return {
      browser: browser.name,
      browserVersion: browser.version,
      os,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      screenResolution: `${screen.width}x${screen.height}`,
      language: navigator.language || "unknown",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown",
      userAgent: ua,
      url: window.location.href,
      deviceType,
      connectionType: connection,
      timestamp: Date.now()
    };
  }
  function detectBrowser(ua) {
    const tests = [
      ["Edge", /Edg(?:e|A|iOS)?\/(\d+[\d.]*)/],
      ["Opera", /(?:OPR|Opera)\/(\d+[\d.]*)/],
      ["Chrome", /Chrome\/(\d+[\d.]*)/],
      ["Firefox", /Firefox\/(\d+[\d.]*)/],
      ["Safari", /Version\/(\d+[\d.]*).*Safari/],
      ["IE", /(?:MSIE |Trident.*rv:)(\d+[\d.]*)/]
    ];
    for (const [name, regex] of tests) {
      const match = ua.match(regex);
      if (match) return { name, version: match[1] };
    }
    return { name: "Unknown", version: "" };
  }
  function detectOS(ua) {
    var _a, _b, _c, _d, _e;
    if (/Windows NT 10/.test(ua)) return "Windows 10/11";
    if (/Windows NT/.test(ua)) return "Windows";
    if (/Mac OS X (\d+[._]\d+)/.test(ua)) {
      const ver = (_b = (_a = ua.match(/Mac OS X (\d+[._]\d+)/)) == null ? void 0 : _a[1]) == null ? void 0 : _b.replace(/_/g, ".");
      return `macOS ${ver}`;
    }
    if (/CrOS/.test(ua)) return "Chrome OS";
    if (/Linux/.test(ua)) return "Linux";
    if (/Android (\d+[\d.]*)/.test(ua)) return `Android ${(_c = ua.match(/Android (\d+[\d.]*)/)) == null ? void 0 : _c[1]}`;
    if (/iPhone|iPad/.test(ua)) {
      const ver = (_e = (_d = ua.match(/OS (\d+_\d+)/)) == null ? void 0 : _d[1]) == null ? void 0 : _e.replace(/_/g, ".");
      return `iOS ${ver || ""}`;
    }
    return "Unknown OS";
  }
  function detectDeviceType() {
    const w = window.innerWidth;
    if (/Mobi|Android.*Mobile|iPhone/i.test(navigator.userAgent) || w < 768) return "mobile";
    if (/iPad|Android(?!.*Mobile)|Tablet/i.test(navigator.userAgent) || w >= 768 && w < 1024) return "tablet";
    return "desktop";
  }
  function getConnectionType() {
    const nav = navigator;
    if (nav.connection) {
      const c = nav.connection;
      return c.effectiveType || c.type || "unknown";
    }
    return "unknown";
  }
  var init_environment = __esm({
    "src/environment.ts"() {
      "use strict";
    }
  });

  // src/voice-recorder.ts
  function isVoiceSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }
  function startVoiceRecording(options) {
    var _a;
    if (isRecording) return false;
    if (!isVoiceSupported()) {
      (_a = options == null ? void 0 : options.onStatus) == null ? void 0 : _a.call(options, "error", "Speech recognition not supported in this browser.");
      return false;
    }
    onTranscriptUpdate = (options == null ? void 0 : options.onUpdate) || null;
    onStatusChange = (options == null ? void 0 : options.onStatus) || null;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";
    recognition.maxAlternatives = 1;
    transcript = "";
    interimTranscript = "";
    startTime = Date.now();
    recognition.onresult = (event) => {
      let final = "";
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      if (final) {
        transcript += (transcript ? " " : "") + cleanTranscript(final.trim());
      }
      interimTranscript = interim;
      onTranscriptUpdate == null ? void 0 : onTranscriptUpdate(transcript, interimTranscript);
    };
    recognition.onerror = (event) => {
      const errorMessages = {
        "not-allowed": "Microphone access denied. Please allow microphone permission.",
        "no-speech": "No speech detected. Try speaking louder.",
        "network": "Network error. Speech recognition requires an internet connection.",
        "audio-capture": "No microphone found. Please connect a microphone.",
        "aborted": "Recording was cancelled."
      };
      const message = errorMessages[event.error] || `Speech recognition error: ${event.error}`;
      if (event.error === "no-speech") return;
      isRecording = false;
      recognition = null;
      onStatusChange == null ? void 0 : onStatusChange("error", message);
      onStatusChange = null;
      onTranscriptUpdate = null;
    };
    recognition.onend = () => {
      if (isRecording) {
        try {
          recognition.start();
        } catch (e2) {
          isRecording = false;
          onStatusChange == null ? void 0 : onStatusChange("stopped");
        }
        return;
      }
      onStatusChange == null ? void 0 : onStatusChange("stopped");
    };
    try {
      recognition.start();
      isRecording = true;
      onStatusChange == null ? void 0 : onStatusChange("recording");
      return true;
    } catch (err) {
      onStatusChange == null ? void 0 : onStatusChange("error", err.message || "Failed to start voice recording.");
      return false;
    }
  }
  function stopVoiceRecording() {
    if (!isRecording && !recognition) return null;
    isRecording = false;
    onStatusChange == null ? void 0 : onStatusChange("stopped");
    if (recognition) {
      try {
        recognition.onend = null;
        recognition.stop();
      } catch (e2) {
      }
      recognition = null;
    }
    if (interimTranscript.trim()) {
      transcript += (transcript ? " " : "") + cleanTranscript(interimTranscript.trim());
      interimTranscript = "";
    }
    if (!transcript.trim()) return null;
    const result = {
      id: `voice_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: startTime,
      text: transcript.trim(),
      duration: Date.now() - startTime
    };
    transcripts.push(result);
    onTranscriptUpdate = null;
    onStatusChange = null;
    return result;
  }
  function isVoiceRecording() {
    return isRecording;
  }
  function getVoiceTranscripts() {
    return [...transcripts];
  }
  function clearVoiceTranscripts() {
    transcripts.length = 0;
  }
  function cleanTranscript(text) {
    if (!text) return text;
    text = text.charAt(0).toUpperCase() + text.slice(1);
    if (!/[.!?]$/.test(text.trim())) {
      text = text.trim() + ".";
    }
    text = text.replace(/\bperiod\b/gi, ".").replace(/\bcomma\b/gi, ",").replace(/\bquestion mark\b/gi, "?").replace(/\bexclamation mark\b/gi, "!").replace(/\bnew line\b/gi, "\n").replace(/\s+/g, " ").replace(/\s+([.,!?])/g, "$1").replace(/([.!?])\s+([a-z])/g, (_m, p, c) => `${p} ${c.toUpperCase()}`);
    return text;
  }
  var recognition, isRecording, transcript, interimTranscript, startTime, transcripts, onTranscriptUpdate, onStatusChange;
  var init_voice_recorder = __esm({
    "src/voice-recorder.ts"() {
      "use strict";
      recognition = null;
      isRecording = false;
      transcript = "";
      interimTranscript = "";
      startTime = 0;
      transcripts = [];
      onTranscriptUpdate = null;
      onStatusChange = null;
    }
  });

  // src/video-recorder.ts
  function isVideoSupported() {
    return !!(typeof navigator !== "undefined" && navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === "function" && typeof window.MediaRecorder === "function");
  }
  function isVideoRecording() {
    return _recorder !== null && _recorder.state === "recording";
  }
  function getVideoElapsedMs() {
    return isVideoRecording() ? Date.now() - _startedAt : 0;
  }
  function pickMimeType() {
    const candidates = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm"
    ];
    const MR = window.MediaRecorder;
    if (!MR || typeof MR.isTypeSupported !== "function") return "";
    for (const t of candidates) {
      if (MR.isTypeSupported(t)) return t;
    }
    return "";
  }
  async function startVideoRecording(options) {
    var _a;
    if (isVideoRecording()) return false;
    if (!isVideoSupported()) {
      (_a = options == null ? void 0 : options.onStatus) == null ? void 0 : _a.call(options, "error", "Screen recording is not supported in this browser.");
      return false;
    }
    _onStatus = (options == null ? void 0 : options.onStatus) || null;
    let displayStream;
    try {
      displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30, max: 60 } },
        audio: true
      });
    } catch (err) {
      if ((err == null ? void 0 : err.name) === "NotAllowedError" || (err == null ? void 0 : err.name) === "AbortError") {
        _onStatus == null ? void 0 : _onStatus("stopped", "cancelled");
        return false;
      }
      _onStatus == null ? void 0 : _onStatus("error", (err == null ? void 0 : err.message) || "Could not start screen capture.");
      return false;
    }
    if (options == null ? void 0 : options.withMicrophone) {
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        micStream.getAudioTracks().forEach((t) => displayStream.addTrack(t));
      } catch (e2) {
      }
    }
    _stream = displayStream;
    _chunks = [];
    _comments = [];
    _startedAt = Date.now();
    _mimeType = pickMimeType();
    try {
      _recorder = _mimeType ? new MediaRecorder(displayStream, { mimeType: _mimeType }) : new MediaRecorder(displayStream);
    } catch (err) {
      _stream.getTracks().forEach((t) => t.stop());
      _stream = null;
      _onStatus == null ? void 0 : _onStatus("error", (err == null ? void 0 : err.message) || "MediaRecorder could not be created.");
      return false;
    }
    _recorder.ondataavailable = (e2) => {
      if (e2.data && e2.data.size > 0) _chunks.push(e2.data);
    };
    displayStream.getVideoTracks().forEach((track) => {
      track.addEventListener("ended", () => {
        if (isVideoRecording()) stopVideoRecording().catch(() => {
        });
      });
    });
    _recorder.start(1e3);
    _onStatus == null ? void 0 : _onStatus("recording");
    return true;
  }
  function stopVideoRecording() {
    return new Promise((resolve) => {
      if (!_recorder || _recorder.state === "inactive") {
        resolve(null);
        return;
      }
      const recorder = _recorder;
      const stream = _stream;
      const startedAt = _startedAt;
      const mimeType = _mimeType || "video/webm";
      const comments = _comments.slice();
      recorder.onstop = () => {
        const blob = new Blob(_chunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const recording = {
          url,
          blob,
          durationMs: Date.now() - startedAt,
          mimeType,
          sizeBytes: blob.size,
          comments,
          startedAt
        };
        if (_lastRecording && _lastRecording.url !== url) {
          try {
            URL.revokeObjectURL(_lastRecording.url);
          } catch (e2) {
          }
        }
        _lastRecording = recording;
        stream == null ? void 0 : stream.getTracks().forEach((t) => t.stop());
        _recorder = null;
        _stream = null;
        _chunks = [];
        _comments = [];
        _onStatus == null ? void 0 : _onStatus("stopped");
        resolve(recording);
      };
      try {
        recorder.stop();
      } catch (e2) {
        resolve(null);
      }
    });
  }
  function addVideoComment(text) {
    if (!isVideoRecording()) return null;
    const trimmed = text.trim();
    if (!trimmed) return null;
    const c = { offsetMs: Date.now() - _startedAt, text: trimmed };
    _comments.push(c);
    return c;
  }
  function getLastVideoRecording() {
    return _lastRecording;
  }
  function clearVideoRecording() {
    if (_lastRecording) {
      try {
        URL.revokeObjectURL(_lastRecording.url);
      } catch (e2) {
      }
      _lastRecording = null;
    }
  }
  function abortVideoRecording() {
    if (_recorder && _recorder.state !== "inactive") {
      try {
        _recorder.stop();
      } catch (e2) {
      }
    }
    _stream == null ? void 0 : _stream.getTracks().forEach((t) => t.stop());
    _recorder = null;
    _stream = null;
    _chunks = [];
    _comments = [];
  }
  function downloadVideoRecording(recording, filename = "tracebug-recording.webm") {
    const a2 = document.createElement("a");
    a2.href = recording.url;
    a2.download = filename;
    document.body.appendChild(a2);
    a2.click();
    document.body.removeChild(a2);
  }
  var _recorder, _stream, _chunks, _startedAt, _mimeType, _comments, _lastRecording, _onStatus;
  var init_video_recorder = __esm({
    "src/video-recorder.ts"() {
      "use strict";
      _recorder = null;
      _stream = null;
      _chunks = [];
      _startedAt = 0;
      _mimeType = "";
      _comments = [];
      _lastRecording = null;
      _onStatus = null;
    }
  });

  // src/title-generator.ts
  function generateBugTitle(session) {
    var _a;
    const events = session.events;
    const errorEvents = events.filter((e2) => e2.type === "error" || e2.type === "unhandled_rejection");
    const userActions = events.filter(
      (e2) => ["click", "input", "select_change", "form_submit", "route_change"].includes(e2.type)
    );
    if (errorEvents.length === 0) {
      return generateFlowTitle(userActions, events);
    }
    const errorMsg = ((_a = errorEvents[0].data.error) == null ? void 0 : _a.message) || session.errorMessage || "Unknown error";
    const errorType = classifyError(errorMsg);
    const lastAction = userActions.length > 0 ? userActions[userActions.length - 1] : null;
    const page = errorEvents[0].page || "";
    const context = getActionContext(lastAction);
    const pageName = friendlyPage(page);
    if (context && pageName) {
      return `${pageName}: ${context} Fails \u2014 ${errorType}`;
    }
    if (context) {
      return `${context} Fails Due to ${errorType}`;
    }
    if (pageName) {
      return `${errorType} on ${pageName}`;
    }
    return `${errorType}: ${truncate(errorMsg, 60)}`;
  }
  function generateFlowSummary(events) {
    const userActions = events.filter(
      (e2) => ["click", "input", "select_change", "form_submit", "route_change"].includes(e2.type)
    );
    if (userActions.length === 0) return "No user interactions recorded";
    const parts = [];
    for (const ev of userActions.slice(-5)) {
      parts.push(describeAction(ev));
    }
    return parts.join(" \u2192 ");
  }
  function generateFlowTitle(userActions, allEvents) {
    const failedApis = allEvents.filter(
      (e2) => {
        var _a, _b;
        return e2.type === "api_request" && (((_a = e2.data.request) == null ? void 0 : _a.statusCode) >= 400 || ((_b = e2.data.request) == null ? void 0 : _b.statusCode) === 0);
      }
    );
    if (failedApis.length > 0) {
      const api = failedApis[0].data.request;
      const lastAction = userActions.length > 0 ? userActions[userActions.length - 1] : null;
      const context = getActionContext(lastAction);
      return context ? `${context} \u2014 API ${api == null ? void 0 : api.method} Returns ${(api == null ? void 0 : api.statusCode) || "Network Error"}` : `API Failure: ${api == null ? void 0 : api.method} ${shortenUrl2(api == null ? void 0 : api.url)} Returns ${(api == null ? void 0 : api.statusCode) || "Network Error"}`;
    }
    if (userActions.length === 0) return "Empty Session \u2014 No User Interactions";
    const lastActions = userActions.slice(-3);
    const parts = lastActions.map((a2) => describeAction(a2));
    return `Session: ${parts.join(" \u2192 ")}`;
  }
  function getActionContext(event) {
    var _a, _b, _c, _d, _e, _f;
    if (!event) return "";
    switch (event.type) {
      case "click": {
        const el = event.data.element;
        const text = ((_a = el == null ? void 0 : el.text) == null ? void 0 : _a.trim()) || (el == null ? void 0 : el.ariaLabel) || "";
        if (text && text.length < 40) return `"${text}" Action`;
        if (el == null ? void 0 : el.id) return `${capitalize2(el.id.replace(/[-_]/g, " "))} Action`;
        return "Button Click";
      }
      case "input": {
        const name = ((_b = event.data.element) == null ? void 0 : _b.name) || ((_c = event.data.element) == null ? void 0 : _c.id) || "";
        return name ? `${capitalize2(name.replace(/[-_]/g, " "))} Input` : "Form Input";
      }
      case "select_change": {
        const name = ((_d = event.data.element) == null ? void 0 : _d.name) || "";
        const value = ((_e = event.data.element) == null ? void 0 : _e.selectedText) || "";
        if (name && value) return `Setting ${capitalize2(name)} to "${value}"`;
        return "Dropdown Selection";
      }
      case "form_submit": {
        const formId = ((_f = event.data.form) == null ? void 0 : _f.id) || "";
        return formId ? `${capitalize2(formId.replace(/[-_]/g, " "))} Submission` : "Form Submission";
      }
      case "route_change":
        return `Navigation to ${friendlyPage(event.data.to || "")}`;
      default:
        return "";
    }
  }
  function describeAction(ev) {
    var _a, _b, _c, _d, _e;
    switch (ev.type) {
      case "click": {
        const text = ((_b = (_a = ev.data.element) == null ? void 0 : _a.text) == null ? void 0 : _b.trim()) || ((_c = ev.data.element) == null ? void 0 : _c.id) || "element";
        return `Click "${truncate(text, 20)}"`;
      }
      case "input":
        return `Type in "${((_d = ev.data.element) == null ? void 0 : _d.name) || "field"}"`;
      case "select_change":
        return `Select "${((_e = ev.data.element) == null ? void 0 : _e.selectedText) || "option"}"`;
      case "form_submit":
        return "Submit Form";
      case "route_change":
        return `Go to ${ev.data.to || "/"}`;
      default:
        return ev.type;
    }
  }
  function classifyError(msg) {
    const m = msg.toLowerCase();
    if (m.includes("typeerror") || m.includes("cannot read prop") || m.includes("is not a function"))
      return "TypeError";
    if (m.includes("referenceerror") || m.includes("is not defined"))
      return "ReferenceError";
    if (m.includes("syntaxerror"))
      return "SyntaxError";
    if (m.includes("rangeerror"))
      return "RangeError";
    if (m.includes("networkerror") || m.includes("failed to fetch") || m.includes("network"))
      return "Network Error";
    if (m.includes("timeout") || m.includes("timed out"))
      return "Timeout Error";
    if (m.includes("aborted"))
      return "Aborted Request";
    if (m.includes("permission") || m.includes("cors"))
      return "Permission Error";
    const typeMatch = msg.match(/^(\w+Error):/);
    if (typeMatch) return typeMatch[1];
    return "Runtime Error";
  }
  function friendlyPage(path) {
    if (!path || path === "/") return "Home Page";
    const parts = path.split("/").filter(Boolean);
    return parts.map((p) => capitalize2(p)).join(" ") + " Page";
  }
  function capitalize2(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
  function truncate(str, len) {
    return str.length > len ? str.slice(0, len) + "..." : str;
  }
  function shortenUrl2(url) {
    if (!url) return "";
    try {
      return new URL(url, window.location.origin).pathname;
    } catch (e2) {
      return url.slice(0, 40);
    }
  }
  var init_title_generator = __esm({
    "src/title-generator.ts"() {
      "use strict";
    }
  });

  // src/timeline-builder.ts
  function buildTimeline(events) {
    var _a, _b;
    if (events.length === 0) return [];
    const startTs = events[0].timestamp;
    const timeline = [];
    let lastDescription = "";
    for (const ev of events) {
      const elapsed = formatElapsed(ev.timestamp - startTs);
      const isError = ["error", "unhandled_rejection", "console_error"].includes(ev.type);
      const isApiError = ev.type === "api_request" && (((_a = ev.data.request) == null ? void 0 : _a.statusCode) >= 400 || ((_b = ev.data.request) == null ? void 0 : _b.statusCode) === 0);
      const description = describeTimelineEvent(ev);
      const entryKey = `${ev.type}:${description}`;
      if (entryKey === lastDescription) continue;
      lastDescription = entryKey;
      timeline.push({
        timestamp: ev.timestamp,
        elapsed,
        type: ev.type,
        description,
        isError: isError || isApiError,
        page: ev.page
      });
    }
    return timeline;
  }
  function formatTimelineText(entries) {
    if (entries.length === 0) return "(empty session)";
    const lines = [];
    for (const entry of entries) {
      const marker = entry.isError ? "!!" : "  ";
      lines.push(`${entry.elapsed} ${marker} ${entry.type.padEnd(18)} ${entry.description}`);
    }
    return lines.join("\n");
  }
  function describeTimelineEvent(ev) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
    switch (ev.type) {
      case "click": {
        const el = ev.data.element;
        let target = ((_a = el == null ? void 0 : el.text) == null ? void 0 : _a.trim()) || (el == null ? void 0 : el.ariaLabel) || (el == null ? void 0 : el.id) || (el == null ? void 0 : el.tag) || "element";
        if (target.includes("\n")) target = target.split("\n")[0].trim();
        return `click "${target.slice(0, 50)}"`;
      }
      case "input": {
        const name = ((_b = ev.data.element) == null ? void 0 : _b.name) || ((_c = ev.data.element) == null ? void 0 : _c.id) || "field";
        const val = (_d = ev.data.element) == null ? void 0 : _d.value;
        if (val && val !== "[REDACTED]") return `input "${name}" = "${val.slice(0, 30)}"`;
        return `input "${name}"`;
      }
      case "select_change": {
        const name = ((_e = ev.data.element) == null ? void 0 : _e.name) || "dropdown";
        return `select "${name}" \u2192 "${((_f = ev.data.element) == null ? void 0 : _f.selectedText) || ""}"`;
      }
      case "form_submit": {
        const id = ((_g = ev.data.form) == null ? void 0 : _g.id) || "form";
        return `submit ${id} (${((_h = ev.data.form) == null ? void 0 : _h.fieldCount) || 0} fields)`;
      }
      case "route_change":
        return `${ev.data.from || "/"} \u2192 ${ev.data.to || "/"}`;
      case "api_request": {
        const r = ev.data.request;
        const status = (r == null ? void 0 : r.statusCode) === 0 ? "NETWORK_ERR" : String(r == null ? void 0 : r.statusCode);
        return `${r == null ? void 0 : r.method} ${shortenUrl3(r == null ? void 0 : r.url)} \u2192 ${status} (${r == null ? void 0 : r.durationMs}ms)`;
      }
      case "error":
      case "unhandled_rejection":
        return ((_i = ev.data.error) == null ? void 0 : _i.message) || "Unknown error";
      case "console_error":
        return (((_j = ev.data.error) == null ? void 0 : _j.message) || "").slice(0, 80);
      default:
        return JSON.stringify(ev.data).slice(0, 60);
    }
  }
  function formatElapsed(ms) {
    const totalSeconds = Math.floor(ms / 1e3);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const millis = Math.floor(ms % 1e3 / 10);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(2, "0")}`;
  }
  function shortenUrl3(url) {
    if (!url) return "";
    try {
      return new URL(url, window.location.origin).pathname.slice(0, 40);
    } catch (e2) {
      return (url || "").slice(0, 40);
    }
  }
  var init_timeline_builder = __esm({
    "src/timeline-builder.ts"() {
      "use strict";
    }
  });

  // src/report-builder.ts
  function buildReport(session, extraScreenshots) {
    var _a, _b;
    const environment = session.environment || captureEnvironment();
    let steps = session.reproSteps || "";
    if (!steps && session.events.length > 0) {
      const errorMsg = session.errorMessage || "Issue reported by tester";
      const result = generateReproSteps(session.events, errorMsg, session.errorStack || void 0);
      steps = result.reproSteps;
    }
    const seenErrors = /* @__PURE__ */ new Set();
    const consoleErrors = session.events.filter((e2) => ["error", "unhandled_rejection", "console_error"].includes(e2.type)).map((e2) => {
      var _a2, _b2;
      return {
        message: ((_a2 = e2.data.error) == null ? void 0 : _a2.message) || "",
        stack: (_b2 = e2.data.error) == null ? void 0 : _b2.stack,
        timestamp: e2.timestamp
      };
    }).filter((e2) => {
      if (seenErrors.has(e2.message)) return false;
      seenErrors.add(e2.message);
      return true;
    });
    const networkErrors = session.events.filter((e2) => {
      var _a2, _b2;
      return e2.type === "api_request" && (((_a2 = e2.data.request) == null ? void 0 : _a2.statusCode) >= 400 || ((_b2 = e2.data.request) == null ? void 0 : _b2.statusCode) === 0);
    }).map((e2) => {
      var _a2, _b2, _c, _d;
      return {
        method: ((_a2 = e2.data.request) == null ? void 0 : _a2.method) || "GET",
        url: ((_b2 = e2.data.request) == null ? void 0 : _b2.url) || "",
        status: ((_c = e2.data.request) == null ? void 0 : _c.statusCode) || 0,
        duration: ((_d = e2.data.request) == null ? void 0 : _d.durationMs) || 0,
        timestamp: e2.timestamp
      };
    });
    const sessionStart = session.createdAt || ((_b = (_a = session.events[0]) == null ? void 0 : _a.timestamp) != null ? _b : 0);
    const buffer = getNetworkFailures().filter((b) => b.timestamp >= sessionStart);
    for (const entry of networkErrors) {
      const match = buffer.find(
        (b) => b.url === entry.url && b.method === entry.method && b.status === entry.status && Math.abs(b.timestamp - entry.timestamp) < 5e3
      );
      if (match && match.response) entry.response = match.response;
    }
    for (const buf of buffer) {
      const already = networkErrors.some(
        (n) => n.url === buf.url && n.method === buf.method && n.status === buf.status && Math.abs(n.timestamp - buf.timestamp) < 5e3
      );
      if (!already) {
        networkErrors.push({
          method: buf.method,
          url: buf.url,
          status: buf.status,
          duration: 0,
          timestamp: buf.timestamp,
          response: buf.response
        });
      }
    }
    const screenshots2 = [...getScreenshots(), ...extraScreenshots || []];
    const timeline = buildTimeline(session.events);
    const voiceTranscripts = getVoiceTranscripts();
    const lastVideo = getLastVideoRecording();
    const video = lastVideo ? {
      url: lastVideo.url,
      durationMs: lastVideo.durationMs,
      mimeType: lastVideo.mimeType,
      sizeBytes: lastVideo.sizeBytes,
      comments: lastVideo.comments.slice(),
      startedAt: lastVideo.startedAt
    } : void 0;
    const title = generateBugTitle(session);
    const sessionSteps = generateSessionSteps(session.events);
    const clickedElement = extractClickedElement(session.events);
    const report = {
      title,
      summary: "",
      steps,
      environment,
      consoleErrors,
      networkErrors,
      sessionSteps,
      clickedElement,
      rootCause: { hint: "", confidence: "low" },
      annotations: session.annotations || [],
      screenshots: screenshots2,
      timeline,
      voiceTranscripts,
      video,
      session,
      generatedAt: Date.now()
    };
    report.summary = generateSmartSummary(report);
    report.rootCause = generateRootCauseHint(report);
    return report;
  }
  function generateSmartSummary(report) {
    var _a, _b, _c, _d;
    const page = ((_a = report.environment) == null ? void 0 : _a.url) ? safePath(report.environment.url) : ((_d = (_c = (_b = report.session) == null ? void 0 : _b.events) == null ? void 0 : _c[0]) == null ? void 0 : _d.page) || "/";
    const click = report.clickedElement;
    const firstNet = report.networkErrors[0];
    const firstErr = report.consoleErrors[0];
    const clickPhrase = click ? describeClickPhrase(click) : "";
    const pagePhrase = ` on ${page}`;
    if (firstNet && clickPhrase) {
      return `API ${firstNet.method} ${shortPath(firstNet.url)} failed with ${formatStatus(firstNet.status)} when ${clickPhrase}${pagePhrase}`;
    }
    if (firstErr && clickPhrase) {
      const errType = classifyErrorType(firstErr.message);
      return `${errType} thrown when ${clickPhrase}${pagePhrase} \u2014 ${truncateMsg(firstErr.message, 80)}`;
    }
    if (firstNet) {
      return `API ${firstNet.method} ${shortPath(firstNet.url)} failed with ${formatStatus(firstNet.status)}${pagePhrase}`;
    }
    if (firstErr) {
      const errType = classifyErrorType(firstErr.message);
      return `${errType}${pagePhrase}: ${truncateMsg(firstErr.message, 100)}`;
    }
    if (clickPhrase) {
      return `User action \u2014 ${clickPhrase}${pagePhrase} (no errors captured)`;
    }
    return `Bug report captured${pagePhrase}`;
  }
  function describeClickPhrase(click) {
    var _a;
    const label = ((_a = click.text) == null ? void 0 : _a.trim()) || click.ariaLabel || click.testId || click.id || click.tag || "element";
    const kind = click.tag === "button" ? "button" : click.tag === "a" ? "link" : click.tag === "input" ? "input" : "element";
    return `clicking '${truncateMsg(label, 40)}' ${kind}`;
  }
  function formatStatus(status) {
    if (status === 0) return "Network Error";
    return String(status);
  }
  function shortPath(url) {
    if (!url) return "";
    try {
      const u2 = new URL(url, typeof window !== "undefined" ? window.location.origin : "http://localhost");
      return u2.pathname || url.slice(0, 40);
    } catch (e2) {
      return url.length > 40 ? url.slice(0, 40) + "\u2026" : url;
    }
  }
  function safePath(url) {
    try {
      return new URL(url).pathname || "/";
    } catch (e2) {
      return url;
    }
  }
  function classifyErrorType(msg) {
    const m = (msg || "").toLowerCase();
    if (m.includes("typeerror")) return "TypeError";
    if (m.includes("referenceerror")) return "ReferenceError";
    if (m.includes("syntaxerror")) return "SyntaxError";
    if (m.includes("rangeerror")) return "RangeError";
    const match = (msg || "").match(/^(\w+Error)/);
    if (match) return match[1];
    return "Error";
  }
  function truncateMsg(msg, n) {
    if (!msg) return "";
    const single = msg.replace(/\s+/g, " ").trim();
    return single.length > n ? single.slice(0, n) + "\u2026" : single;
  }
  function generateSessionSteps(events) {
    const steps = [];
    for (const ev of events) {
      const line = describeStep(ev);
      if (line) steps.push(line);
    }
    return steps.slice(-SESSION_STEPS_LIMIT);
  }
  function describeStep(ev) {
    var _a, _b, _c, _d;
    switch (ev.type) {
      case "click": {
        const el = ev.data.element;
        const label = ((el == null ? void 0 : el.text) || (el == null ? void 0 : el.ariaLabel) || (el == null ? void 0 : el.id) || (el == null ? void 0 : el.tag) || "element").toString().trim().split("\n")[0];
        const kind = (el == null ? void 0 : el.tag) === "button" || (el == null ? void 0 : el.buttonType) ? "button" : (el == null ? void 0 : el.tag) === "a" ? "link" : (el == null ? void 0 : el.tag) || "element";
        return `Clicked '${truncateMsg(label, 40)}' ${kind}`;
      }
      case "route_change":
        return `Navigated to ${ev.data.to || "/"}`;
      case "form_submit": {
        const id = (_a = ev.data.form) == null ? void 0 : _a.id;
        return id ? `Submitted '${id}' form` : "Submitted form";
      }
      case "select_change": {
        const name = ((_b = ev.data.element) == null ? void 0 : _b.name) || "dropdown";
        const val = ((_c = ev.data.element) == null ? void 0 : _c.selectedText) || ((_d = ev.data.element) == null ? void 0 : _d.value) || "";
        return `Selected '${truncateMsg(val, 30)}' in ${name}`;
      }
      // Inputs intentionally skipped — too noisy for a 10-step summary.
      default:
        return null;
    }
  }
  function extractClickedElement(events) {
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i];
      if (ev.type !== "click") continue;
      const el = ev.data.element || {};
      return {
        tag: el.tag || "",
        text: ((el.text || "").toString().trim().split("\n")[0] || "").slice(0, 120),
        selector: el.selector || void 0,
        id: el.id || void 0,
        ariaLabel: el.ariaLabel || void 0,
        testId: el.testId || void 0,
        page: ev.page || "/"
      };
    }
    return null;
  }
  function generateRootCauseHint(report) {
    const firstNet = report.networkErrors && report.networkErrors[0];
    const firstErr = report.consoleErrors && report.consoleErrors[0];
    const click = report.clickedElement;
    if (firstNet) {
      const endpoint = shortPath(firstNet.url);
      const status = firstNet.status === 0 ? "Network Error" : String(firstNet.status);
      const method = firstNet.method || "GET";
      const actionPhrase = click ? ` after clicking '${clickLabel(click)}'` : "";
      return {
        hint: `API ${method} ${endpoint} failed with ${status}${actionPhrase}`,
        confidence: "high"
      };
    }
    if (firstErr && firstErr.message) {
      const errType = classifyErrorType(firstErr.message);
      const suggestion = suggestCauseFromError(firstErr.message);
      return {
        hint: `${errType} ${suggestion}`,
        confidence: "medium"
      };
    }
    if (click) {
      return {
        hint: `Click on '${clickLabel(click)}' did not trigger any observable effect`,
        confidence: "low"
      };
    }
    return {
      hint: "Not enough signal captured to suggest a likely cause",
      confidence: "low"
    };
  }
  function formatRootCauseLine(rc) {
    if (!rc || !rc.hint) return "";
    return `\u{1F50D} Possible Cause (${rc.confidence} confidence): ${rc.hint}`;
  }
  function clickLabel(click) {
    const raw = click.text || click.ariaLabel || click.testId || click.id || click.tag || "element";
    return truncateMsg(raw, RC_LABEL_MAX);
  }
  function suggestCauseFromError(msg) {
    const m = msg.toLowerCase();
    if (m.includes("cannot read prop") || m.includes("cannot read properties") || m.includes("of undefined") || m.includes("of null")) {
      return "suggests undefined/null data \u2014 the response or upstream value was likely missing";
    }
    if (m.includes("cannot set prop") || m.includes("cannot assign to read only")) {
      return "suggests writing to an undefined/null or frozen object";
    }
    if (m.includes("is not a function")) {
      return "suggests the target is not callable \u2014 check imports, typos, or a wrong value shape";
    }
    if (m.includes("is not defined") || m.includes("is not a constructor")) {
      return "suggests a missing variable, import, or stale build";
    }
    if (m.includes("maximum call stack")) {
      return "suggests infinite recursion or a render loop";
    }
    if (m.includes("unexpected token") || m.includes("unexpected end of")) {
      return "suggests malformed JSON or a parsing issue in the response";
    }
    if (m.includes("failed to fetch") || m.includes("networkerror") || m.includes("load failed")) {
      return "suggests a blocked or failed request \u2014 check CORS, offline, or DNS";
    }
    if (m.includes("aborted") || m.includes("abort")) {
      return "suggests the request was cancelled before completion";
    }
    if (m.includes("timeout") || m.includes("timed out")) {
      return "suggests an upstream service is slow or unreachable";
    }
    if (m.includes("cors")) {
      return "suggests a CORS policy mismatch on the server";
    }
    if (m.includes("permission") || m.includes("denied")) {
      return "suggests a missing permission or authorization failure";
    }
    if (m.includes("quota") || m.includes("exceeded")) {
      return "suggests a storage or rate limit was exceeded";
    }
    return "suggests an unexpected runtime value \u2014 inspect inputs and data sources";
  }
  var SESSION_STEPS_LIMIT, RC_LABEL_MAX;
  var init_report_builder = __esm({
    "src/report-builder.ts"() {
      "use strict";
      init_environment();
      init_screenshot();
      init_voice_recorder();
      init_video_recorder();
      init_title_generator();
      init_timeline_builder();
      init_repro_generator();
      init_collectors();
      SESSION_STEPS_LIMIT = 10;
      RC_LABEL_MAX = 40;
    }
  });

  // src/github-issue.ts
  function generateGitHubIssueUrl(repo, report, labels) {
    if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
      throw new Error(`Invalid repo format: "${repo}". Expected "owner/repo".`);
    }
    const title = report.title || "Bug report";
    let body = generateGitHubIssue(report);
    body = body.replace(/^##\s+[^\n]+\n+/, "");
    if (body.length > GITHUB_URL_BODY_LIMIT) {
      body = body.slice(0, GITHUB_URL_BODY_LIMIT) + '\n\n_(Report truncated due to URL length limit. Use "Copy as GitHub Issue" for the full version.)_';
    }
    const params = new URLSearchParams();
    params.set("title", title);
    params.set("body", body);
    if (labels && labels.length > 0) {
      params.set("labels", labels.join(","));
    }
    return `https://github.com/${repo}/issues/new?${params.toString()}`;
  }
  function openGitHubIssue(repo, report, labels) {
    try {
      const url = generateGitHubIssueUrl(repo, report, labels);
      if (url.length > 8e3) {
        console.warn("[TraceBug] GitHub URL exceeds 8KB \u2014 issue may not load. Use copy-to-clipboard instead.");
      }
      window.open(url, "_blank", "noopener,noreferrer");
      return true;
    } catch (err) {
      console.warn("[TraceBug] openGitHubIssue failed:", err);
      return false;
    }
  }
  function generateGitHubIssue(report) {
    const env = report.environment;
    let md = `## ${report.title}

`;
    const rc = formatRootCauseLine(report.rootCause);
    if (rc) {
      md += `> ${rc}

`;
    }
    if (report.summary) {
      md += `> **TL;DR:** ${report.summary}

`;
    }
    md += `**Environment:** ${env.browser} ${env.browserVersion} \xB7 ${env.os} \xB7 ${env.viewport} \xB7 ${env.deviceType}
`;
    md += `**URL:** ${env.url}

`;
    if (report.clickedElement) {
      const ce = report.clickedElement;
      const label = ce.text || ce.ariaLabel || ce.id || ce.tag;
      md += `**User clicked:** \`<${ce.tag}>\` "${label}"`;
      if (ce.selector) md += ` \u2014 \`${ce.selector}\``;
      md += `

`;
    }
    if (report.sessionSteps && report.sessionSteps.length > 0) {
      md += `### Recent Actions

`;
      for (const step of report.sessionSteps) {
        md += `1. ${step}
`;
      }
      md += `
`;
    }
    md += `### Steps to Reproduce

`;
    if (report.steps) {
      md += `${report.steps}

`;
    } else {
      md += `_No steps recorded_

`;
    }
    if (report.annotations.length > 0) {
      md += `### Tester Notes

`;
      for (const note of report.annotations) {
        md += `- **[${note.severity.toUpperCase()}]** ${note.text}
`;
        if (note.expected) md += `  - **Expected:** ${note.expected}
`;
        if (note.actual) md += `  - **Actual:** ${note.actual}
`;
      }
      md += `
`;
    }
    const hasTesterResult = report.annotations.some((a2) => a2.actual);
    if (!hasTesterResult && report.consoleErrors.length > 0) {
      md += `### Error

`;
      md += `\`${report.consoleErrors[0].message}\`

`;
    }
    if (report.consoleErrors.length > 0) {
      md += `### Console Errors

`;
      md += `\`\`\`
`;
      for (const err of report.consoleErrors.slice(0, 3)) {
        md += `${err.message}
`;
        if (err.stack) {
          const stackLines = err.stack.split("\n").filter((l) => l.trim().startsWith("at ")).slice(0, 3);
          if (stackLines.length > 0) md += `${stackLines.join("\n")}
`;
        }
      }
      md += `\`\`\`

`;
    }
    if (report.networkErrors.length > 0) {
      md += `### Failed Requests

`;
      md += `| Method | URL | Status | Duration |
`;
      md += `|--------|-----|--------|----------|
`;
      for (const req of report.networkErrors) {
        const status = req.status === 0 ? "Network Error" : `${req.status}`;
        const url = req.url.length > 60 ? req.url.slice(0, 57) + "..." : req.url;
        md += `| ${req.method} | \`${url}\` | ${status} | ${req.duration}ms |
`;
      }
      md += `
`;
      const withBody = report.networkErrors.filter((r) => r.response && r.response.length > 0);
      if (withBody.length > 0) {
        md += `<details>
<summary>Response snippets</summary>

`;
        for (const req of withBody) {
          const status = req.status === 0 ? "Network Error" : String(req.status);
          md += `**${req.method} ${req.url.slice(0, 80)} \u2192 ${status}**

`;
          md += `\`\`\`
${(req.response || "").replace(/```/g, "` ` `")}
\`\`\`

`;
        }
        md += `</details>

`;
      }
    }
    if (report.voiceTranscripts && report.voiceTranscripts.length > 0) {
      md += `### Bug Description (Voice)

`;
      for (const vt of report.voiceTranscripts) {
        md += `> ${vt.text}

`;
      }
    }
    if (report.video) {
      const v = report.video;
      const ext = v.mimeType.includes("mp4") ? "mp4" : "webm";
      const stamp = new Date(v.startedAt).toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const filename = `tracebug-recording-${stamp}.${ext}`;
      md += `### Screen Recording

`;
      md += `> Drag and drop the downloaded recording: \`${filename}\` (${formatVideoMeta(v)})

`;
      if (v.comments.length > 0) {
        md += `**Timestamped comments:**

`;
        for (const c of v.comments) {
          md += `- \`${formatOffset(c.offsetMs)}\` \u2014 ${c.text}
`;
        }
        md += `
`;
      }
    }
    if (report.screenshots.length > 0) {
      md += `### Screenshots

`;
      md += `> Drag and drop the downloaded screenshot files below:

`;
      for (const ss of report.screenshots) {
        md += `- \`${ss.filename}\`
`;
      }
      md += `
`;
    }
    const significantTimeline = report.timeline.filter(
      (e2) => e2.type !== "api_request" || e2.isError
    );
    if (significantTimeline.length > 0) {
      md += `<details>
<summary>Session Timeline (${significantTimeline.length} events)</summary>

`;
      md += `\`\`\`
`;
      md += formatTimelineText(significantTimeline);
      md += `
\`\`\`

`;
      md += `</details>

`;
    }
    md += `---
`;
    md += `_[TraceBug SDK](https://www.npmjs.com/package/tracebug-sdk) \xB7 Session: \`${report.session.sessionId.slice(0, 8)}\`_
`;
    return md;
  }
  function formatVideoMeta(v) {
    const sec = Math.max(0, Math.floor(v.durationMs / 1e3));
    const m = Math.floor(sec / 60).toString().padStart(2, "0");
    const s = (sec % 60).toString().padStart(2, "0");
    const sizeMb = (v.sizeBytes / (1024 * 1024)).toFixed(1);
    return `${m}:${s} \xB7 ${sizeMb} MB`;
  }
  function formatOffset(ms) {
    const sec = Math.max(0, Math.floor(ms / 1e3));
    const m = Math.floor(sec / 60).toString().padStart(2, "0");
    const s = (sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }
  var GITHUB_URL_BODY_LIMIT;
  var init_github_issue = __esm({
    "src/github-issue.ts"() {
      "use strict";
      init_timeline_builder();
      init_report_builder();
      GITHUB_URL_BODY_LIMIT = 6e3;
    }
  });

  // src/jira-issue.ts
  function generateJiraTicket(report) {
    const env = report.environment;
    const priority = determinePriority(report);
    const labels = ["tracebug", "bug"];
    if (report.consoleErrors.length > 0) labels.push("has-errors");
    if (report.networkErrors.length > 0) labels.push("api-failure");
    const envStr = `${env.browser} ${env.browserVersion} / ${env.os} / ${env.viewport} / ${env.deviceType}`;
    let desc = "";
    const rc = formatRootCauseLine(report.rootCause);
    if (rc) {
      desc += `{panel:title=Possible Cause (${report.rootCause.confidence} confidence)|borderColor=#c1c7d0|titleBGColor=#deebff|bgColor=#f4f9ff}
${report.rootCause.hint}
{panel}

`;
    }
    if (report.summary) {
      desc += `{panel:title=TL;DR|borderStyle=solid|borderColor=#ccc|titleBGColor=#f4f5f7|bgColor=#fafbfc}
${report.summary}
{panel}

`;
    }
    if (report.clickedElement) {
      const ce = report.clickedElement;
      const label = ce.text || ce.ariaLabel || ce.id || ce.tag;
      desc += `*User clicked:* {{<${ce.tag}>}} "${label}"`;
      if (ce.selector) desc += ` \u2014 {{${ce.selector}}}`;
      desc += `

`;
    }
    if (report.sessionSteps && report.sessionSteps.length > 0) {
      desc += `h3. Recent Actions
`;
      for (const step of report.sessionSteps) {
        desc += `# ${step}
`;
      }
      desc += `
`;
    }
    desc += `h3. Steps to Reproduce
`;
    if (report.steps) {
      desc += `{noformat}
${report.steps}
{noformat}

`;
    }
    if (report.annotations.length > 0) {
      desc += `h3. Tester Notes
`;
      for (const note of report.annotations) {
        desc += `* *[${note.severity.toUpperCase()}]* ${note.text}
`;
        if (note.expected) desc += `** *Expected:* ${note.expected}
`;
        if (note.actual) desc += `** *Actual:* ${note.actual}
`;
      }
      desc += `
`;
    }
    const hasTesterResult = report.annotations.some((a2) => a2.actual);
    if (!hasTesterResult && report.consoleErrors.length > 0) {
      desc += `h3. Actual Result
Application throws error:
{code}${report.consoleErrors[0].message}{code}

`;
    }
    if (report.consoleErrors.length > 0) {
      desc += `h3. Console Errors
{code}
`;
      for (const err of report.consoleErrors.slice(0, 3)) {
        desc += `${err.message}
`;
        if (err.stack) {
          const stackLines = err.stack.split("\n").filter((l) => l.trim().startsWith("at ")).slice(0, 3);
          if (stackLines.length > 0) desc += `${stackLines.join("\n")}
`;
        }
      }
      desc += `{code}

`;
    }
    if (report.networkErrors.length > 0) {
      desc += `h3. Failed Requests
`;
      desc += `||Method||URL||Status||Duration||
`;
      for (const req of report.networkErrors) {
        const status = req.status === 0 ? "Network Error" : String(req.status);
        desc += `|${req.method}|${req.url.slice(0, 80)}|${status}|${req.duration}ms|
`;
      }
      desc += `
`;
      const withBody = report.networkErrors.filter((r) => r.response && r.response.length > 0);
      if (withBody.length > 0) {
        desc += `h4. Response Snippets
`;
        for (const req of withBody) {
          const status = req.status === 0 ? "Network Error" : String(req.status);
          desc += `*${req.method} ${req.url.slice(0, 80)} \u2192 ${status}*
`;
          desc += `{code}${(req.response || "").replace(/\{code\}/g, "{ code }")}{code}
`;
        }
        desc += `
`;
      }
    }
    if (report.voiceTranscripts && report.voiceTranscripts.length > 0) {
      desc += `h3. Bug Description (Voice)
`;
      desc += `{quote}
`;
      for (const vt of report.voiceTranscripts) {
        desc += `${vt.text}
`;
      }
      desc += `{quote}

`;
    }
    if (report.video) {
      const v = report.video;
      const ext = v.mimeType.includes("mp4") ? "mp4" : "webm";
      const stamp = new Date(v.startedAt).toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const filename = `tracebug-recording-${stamp}.${ext}`;
      desc += `h3. Screen Recording
`;
      desc += `_Attach the downloaded recording: {{${filename}}} (${formatJiraVideoMeta(v)})_
`;
      if (v.comments.length > 0) {
        desc += `*Timestamped comments:*
`;
        for (const c of v.comments) {
          desc += `* {{${formatJiraOffset(c.offsetMs)}}} \u2014 ${c.text}
`;
        }
      }
      desc += `
`;
    }
    if (report.screenshots.length > 0) {
      desc += `h3. Screenshots
`;
      desc += `_Attach the downloaded screenshot files:_
`;
      for (const ss of report.screenshots) {
        desc += `* !${ss.filename}|thumbnail!
`;
      }
      desc += `
`;
    }
    const significantTimeline = report.timeline.filter(
      (e2) => e2.type !== "api_request" || e2.isError
    );
    if (significantTimeline.length > 0) {
      desc += `h3. Session Timeline
{code}
`;
      desc += formatTimelineText(significantTimeline);
      desc += `
{code}

`;
    }
    desc += `h3. Environment
`;
    desc += `* *Browser:* ${env.browser} ${env.browserVersion}
`;
    desc += `* *OS:* ${env.os}
`;
    desc += `* *Viewport:* ${env.viewport}
`;
    desc += `* *Device:* ${env.deviceType}
`;
    desc += `* *URL:* ${env.url}

`;
    desc += `----
_Generated by TraceBug SDK \xB7 Session: ${report.session.sessionId.slice(0, 8)}_
`;
    return {
      summary: report.title,
      description: desc,
      environment: envStr,
      stepsToReproduce: report.steps || "",
      priority,
      labels
    };
  }
  function formatJiraVideoMeta(v) {
    const sec = Math.max(0, Math.floor(v.durationMs / 1e3));
    const m = Math.floor(sec / 60).toString().padStart(2, "0");
    const s = (sec % 60).toString().padStart(2, "0");
    const sizeMb = (v.sizeBytes / (1024 * 1024)).toFixed(1);
    return `${m}:${s} \xB7 ${sizeMb} MB`;
  }
  function formatJiraOffset(ms) {
    const sec = Math.max(0, Math.floor(ms / 1e3));
    const m = Math.floor(sec / 60).toString().padStart(2, "0");
    const s = (sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }
  function determinePriority(report) {
    const hasCriticalError = report.consoleErrors.some(
      (e2) => /TypeError|ReferenceError|SyntaxError/i.test(e2.message)
    );
    if (hasCriticalError) return "Highest";
    const hasServerError = report.networkErrors.some((r) => r.status >= 500);
    if (hasServerError) return "High";
    if (report.networkErrors.length > 0) return "Medium";
    if (report.consoleErrors.length > 0) return "Low";
    if (report.annotations.some((a2) => a2.severity === "critical" || a2.severity === "major")) return "Medium";
    return "Low";
  }
  var init_jira_issue = __esm({
    "src/jira-issue.ts"() {
      "use strict";
      init_timeline_builder();
      init_report_builder();
    }
  });

  // src/ui/helpers.ts
  function parseShortcut(shortcut) {
    const parts = (shortcut || "").toLowerCase().split("+").map((s) => s.trim());
    return {
      mod: parts.includes("ctrl") || parts.includes("control") || parts.includes("cmd") || parts.includes("meta"),
      shift: parts.includes("shift"),
      alt: parts.includes("alt") || parts.includes("option"),
      key: parts[parts.length - 1] || ""
    };
  }
  function matchesShortcut(e2, shortcut) {
    if (!shortcut) return false;
    const s = parseShortcut(shortcut);
    const mod = e2.ctrlKey || e2.metaKey;
    const key = (e2.key || "").toLowerCase();
    return mod === s.mod && e2.shiftKey === s.shift && e2.altKey === s.alt && key === s.key;
  }
  function escapeHtml2(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  var init_helpers = __esm({
    "src/ui/helpers.ts"() {
      "use strict";
    }
  });

  // src/plan.ts
  async function hydratePlan() {
    var _a, _b;
    if (_hydrated) return _cached;
    _hydrated = true;
    try {
      const c = globalThis.chrome;
      if ((_b = (_a = c == null ? void 0 : c.storage) == null ? void 0 : _a.local) == null ? void 0 : _b.get) {
        const result = await new Promise((resolve) => {
          try {
            c.storage.local.get(STORAGE_KEY, (r) => resolve(r || {}));
          } catch (e2) {
            resolve({});
          }
        });
        const v = result[STORAGE_KEY];
        if (v === "premium" || v === "free") {
          _cached = v;
          return _cached;
        }
      }
    } catch (e2) {
    }
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === "premium" || v === "free") _cached = v;
    } catch (e2) {
    }
    return _cached;
  }
  function getPlan() {
    return _cached;
  }
  function isPremium() {
    return _cached === "premium";
  }
  async function setPlan(plan) {
    var _a, _b;
    _cached = plan;
    _hydrated = true;
    try {
      const c = globalThis.chrome;
      if ((_b = (_a = c == null ? void 0 : c.storage) == null ? void 0 : _a.local) == null ? void 0 : _b.set) {
        await new Promise((resolve) => {
          try {
            c.storage.local.set({ [STORAGE_KEY]: plan }, () => resolve());
          } catch (e2) {
            resolve();
          }
        });
      }
    } catch (e2) {
    }
    try {
      localStorage.setItem(STORAGE_KEY, plan);
    } catch (e2) {
    }
  }
  var STORAGE_KEY, FREE_LIMITS, _cached, _hydrated;
  var init_plan = __esm({
    "src/plan.ts"() {
      "use strict";
      STORAGE_KEY = "tracebug_plan";
      FREE_LIMITS = {
        /** Maximum screenshots a free user can attach to a single ticket. */
        screenshots: 2
      };
      _cached = "free";
      _hydrated = false;
    }
  });

  // src/ui/upgrade-modal.ts
  function showUpgradeModal(options, root) {
    const existing = document.getElementById(MODAL_ID);
    if (existing) existing.remove();
    const host = root || document.getElementById("tracebug-root") || document.body;
    const overlay = document.createElement("div");
    overlay.id = MODAL_ID;
    overlay.dataset.tracebug = "upgrade-modal";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 2147483647;
    background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    padding: 20px;
  `;
    const card = document.createElement("div");
    card.dataset.tracebug = "upgrade-modal-card";
    card.style.cssText = `
    background: var(--tb-bg-secondary, #1a1a2e);
    border: 1px solid var(--tb-border-hover, #3a3a5e);
    border-radius: var(--tb-radius-lg, 12px);
    width: 100%; max-width: 380px; padding: 22px;
    font-family: var(--tb-font-family, system-ui, -apple-system, sans-serif);
    color: var(--tb-text-primary, #e0e0e0);
    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
  `;
    card.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
      <span style="font-size:22px">\u2728</span>
      <div style="font-size:16px;font-weight:700;color:var(--tb-text-primary, #fff)">Upgrade to Premium</div>
    </div>
    <div style="font-size:13px;color:var(--tb-text-secondary, #ccc);line-height:1.5;margin-bottom:6px">
      <strong>${escape(options.feature)}</strong> is a premium feature.
    </div>
    <div style="font-size:12px;color:var(--tb-text-muted, #888);line-height:1.5;margin-bottom:18px">
      ${escape(options.message)}
    </div>

    <div style="display:flex;gap:8px;margin-bottom:10px">
      <button data-action="upgrade" style="flex:1;background:var(--tb-accent, #7B61FF);color:#fff;border:none;border-radius:var(--tb-radius-md, 6px);padding:10px;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit">Upgrade (Coming Soon)</button>
      <button data-action="close" style="background:transparent;color:var(--tb-text-muted, #888);border:1px solid var(--tb-border, #2a2a3e);border-radius:var(--tb-radius-md, 6px);padding:10px 14px;cursor:pointer;font-size:12px;font-family:inherit">Not now</button>
    </div>

    <div style="border-top:1px solid var(--tb-border, #2a2a3e);padding-top:10px;margin-top:6px">
      <button data-action="dev-toggle" style="width:100%;background:transparent;color:var(--tb-text-muted, #888);border:1px dashed var(--tb-border, #2a2a3e);border-radius:var(--tb-radius-md, 6px);padding:6px;cursor:pointer;font-size:10px;font-family:monospace">${isPremium() ? "Dev: switch to Free" : "Dev: enable Premium (test only)"}</button>
    </div>
  `;
    overlay.appendChild(card);
    host.appendChild(overlay);
    const close = () => {
      overlay.remove();
    };
    card.querySelector('[data-action="close"]').addEventListener("click", close);
    card.querySelector('[data-action="upgrade"]').addEventListener("click", () => {
      close();
    });
    card.querySelector('[data-action="dev-toggle"]').addEventListener("click", async () => {
      await setPlan(isPremium() ? "free" : "premium");
      close();
      try {
        window.dispatchEvent(new CustomEvent("tracebug-plan-changed"));
      } catch (e2) {
      }
    });
    overlay.addEventListener("click", (e2) => {
      if (e2.target === overlay) close();
    });
    const escHandler = (e2) => {
      if (e2.key === "Escape") {
        close();
        document.removeEventListener("keydown", escHandler);
      }
    };
    document.addEventListener("keydown", escHandler);
  }
  function escape(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }
  var MODAL_ID;
  var init_upgrade_modal = __esm({
    "src/ui/upgrade-modal.ts"() {
      "use strict";
      init_plan();
      MODAL_ID = "tracebug-upgrade-modal";
    }
  });

  // src/ui/toast.ts
  var toast_exports = {};
  __export(toast_exports, {
    showActionToast: () => showActionToast,
    showToast: () => showToast
  });
  function showActionToast(message, actionLabel, onAction, root) {
    const existing = root.querySelector(".bt-toast");
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.className = "bt-toast bt-toast-action";
    toast.dataset.tracebug = "toast";
    toast.setAttribute("role", "alert");
    toast.style.cssText = `
    position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
    background:var(--tb-bg-secondary, #1a1a2e);color:var(--tb-text-primary, #e0e0e0);
    border:1px solid var(--tb-error, #ef4444);border-left:4px solid var(--tb-error, #ef4444);
    border-radius:10px;padding:12px 14px 12px 16px;font-size:13px;
    font-family:system-ui,-apple-system,sans-serif;z-index:2147483647;
    box-shadow:0 8px 32px rgba(0,0,0,0.4);pointer-events:auto;
    max-width:480px;line-height:1.4;
    display:flex;align-items:center;gap:12px;
    animation:tracebug-toast-in 0.2s ease;
  `;
    if (!document.getElementById("tracebug-toast-anim")) {
      const style = document.createElement("style");
      style.id = "tracebug-toast-anim";
      style.textContent = `@keyframes tracebug-toast-in { from { opacity:0; transform:translateX(-50%) translateY(8px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }`;
      document.head.appendChild(style);
    }
    toast.innerHTML = `
    <span style="flex:1">${message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</span>
    <button data-tb-action="capture" style="background:var(--tb-accent, #7B61FF);color:#fff;border:none;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap">${actionLabel.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</button>
    <button data-tb-action="dismiss" aria-label="Dismiss" style="background:none;border:none;color:var(--tb-text-muted, #888);cursor:pointer;font-size:16px;padding:2px 6px;border-radius:4px">\u2715</button>
  `;
    root.appendChild(toast);
    const liveRegion = document.getElementById("tracebug-live");
    if (liveRegion) liveRegion.textContent = message;
    const dismiss = () => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(-50%) translateY(8px)";
      toast.style.transition = "all 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    };
    toast.querySelector('[data-tb-action="capture"]').addEventListener("click", () => {
      dismiss();
      onAction();
    });
    toast.querySelector('[data-tb-action="dismiss"]').addEventListener("click", dismiss);
    setTimeout(dismiss, 8e3);
  }
  function showToast(message, root) {
    const existing = root.querySelector(".bt-toast");
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.className = "bt-toast";
    toast.dataset.tracebug = "toast";
    toast.style.cssText = `
    position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
    background:var(--tb-bg-secondary, #1a1a2e)ee;color:var(--tb-text-primary, #e0e0e0);border:1px solid var(--tb-border-hover, #3a3a5e);
    border-radius:10px;padding:10px 20px;font-size:13px;
    font-family:system-ui,-apple-system,sans-serif;z-index:2147483647;
    box-shadow:0 8px 32px rgba(0,0,0,0.4);pointer-events:auto;
    max-width:420px;text-align:center;line-height:1.4;
    animation:tracebug-toast-in 0.2s ease;
  `;
    if (!document.getElementById("tracebug-toast-anim")) {
      const style = document.createElement("style");
      style.id = "tracebug-toast-anim";
      style.textContent = `@keyframes tracebug-toast-in { from { opacity:0; transform:translateX(-50%) translateY(8px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }`;
      document.head.appendChild(style);
    }
    toast.textContent = message;
    toast.setAttribute("role", "status");
    root.appendChild(toast);
    const liveRegion = document.getElementById("tracebug-live");
    if (liveRegion) liveRegion.textContent = message;
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(-50%) translateY(8px)";
      toast.style.transition = "all 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, 2e3);
  }
  var init_toast = __esm({
    "src/ui/toast.ts"() {
      "use strict";
    }
  });

  // src/ui/quick-bug.ts
  var quick_bug_exports = {};
  __export(quick_bug_exports, {
    isQuickBugOpen: () => isQuickBugOpen,
    setGithubRepo: () => setGithubRepo,
    showQuickBugCapture: () => showQuickBugCapture
  });
  function setGithubRepo(repo) {
    _githubRepo = repo;
  }
  function isQuickBugOpen() {
    return _isOpen;
  }
  async function showQuickBugCapture(root) {
    if (_isOpen) return;
    const sessions = getAllSessions().sort((a2, b) => b.updatedAt - a2.updatedAt);
    const currentSession = sessions[0] || null;
    const lastEvent = (currentSession == null ? void 0 : currentSession.events[currentSession.events.length - 1]) || null;
    let screenshots2 = getScreenshots();
    if (screenshots2.length === 0) {
      try {
        await captureScreenshot(lastEvent, { includeAnnotations: true });
        screenshots2 = getScreenshots();
      } catch (err) {
        console.warn("[TraceBug] Quick capture screenshot failed:", err);
      }
    }
    const draft = _loadDraft();
    const autoTitle = currentSession ? generateBugTitle(currentSession) : `Bug on ${window.location.pathname}`;
    const autoDesc = _buildDescription(currentSession);
    _openModal(root, {
      title: (draft == null ? void 0 : draft.title) || autoTitle,
      description: (draft == null ? void 0 : draft.description) || autoDesc,
      screenshots: screenshots2
    });
  }
  function _downloadAllScreenshots(screenshots2) {
    screenshots2.forEach((ss, i) => {
      setTimeout(() => downloadScreenshot(ss.dataUrl, ss.filename), i * 120);
    });
  }
  function _downloadVideoIfPresent() {
    const v = getLastVideoRecording();
    if (!v) return;
    downloadVideoRecording(v, _videoFilename(v));
  }
  function _buildDescription(session) {
    const env = (session == null ? void 0 : session.environment) || captureEnvironment();
    const flow = session ? generateFlowSummary(session.events) : "";
    const errorMsg = (session == null ? void 0 : session.errorMessage) || "";
    let summary = "";
    let rootCauseLine = "";
    let networkLines = [];
    let recentSteps = [];
    try {
      if (session) {
        const report = buildReport(session);
        summary = report.summary;
        rootCauseLine = formatRootCauseLine(report.rootCause);
        recentSteps = report.sessionSteps || [];
        networkLines = (report.networkErrors || []).slice(0, 3).map((n) => {
          const status = n.status === 0 ? "Network Error" : String(n.status);
          const snippet = n.response ? ` \u2014 ${n.response.replace(/\s+/g, " ").slice(0, 80)}` : "";
          return `- ${n.method} ${n.url.slice(0, 60)} \u2192 ${status}${snippet}`;
        });
      }
    } catch (e2) {
    }
    const lines = [];
    if (rootCauseLine) {
      lines.push(`> ${rootCauseLine}`, "");
    }
    if (summary) {
      lines.push(`**Summary:** ${summary}`, "");
    }
    lines.push(errorMsg ? `**Error:** ${errorMsg}` : `**Bug on:** ${window.location.pathname}`, "");
    if (recentSteps.length > 0) {
      lines.push("**Recent actions:**");
      recentSteps.forEach((s) => lines.push(`- ${s}`));
      lines.push("");
    }
    lines.push(
      "**Steps to reproduce:**",
      (session == null ? void 0 : session.reproSteps) || flow || "_(describe what you were doing)_",
      ""
    );
    if (networkLines.length > 0) {
      lines.push("**Failed requests:**", ...networkLines, "");
    }
    lines.push(
      "**Expected:** _(what should happen)_",
      "",
      "**Actual:** _(what actually happened)_",
      "",
      `**Environment:** ${env.browser} ${env.browserVersion} on ${env.os} \xB7 ${env.viewport}`
    );
    return lines.join("\n");
  }
  function _openModal(root, data) {
    _isOpen = true;
    const primary = data.screenshots[0] || null;
    const screenshots2 = data.screenshots;
    const existing = document.getElementById(MODAL_ID2);
    if (existing) existing.remove();
    const overlay = document.createElement("div");
    overlay.id = MODAL_ID2;
    overlay.dataset.tracebug = "quick-bug-modal";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Quick bug capture");
    overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 2147483647;
    background: rgba(0,0,0,0.75); backdrop-filter: blur(6px);
    display: flex; align-items: center; justify-content: center;
    padding: 20px; pointer-events: auto;
    animation: tracebug-qb-fade-in 0.15s ease;
  `;
    const modal = document.createElement("div");
    modal.dataset.tracebug = "quick-bug-inner";
    modal.style.cssText = `
    background: var(--tb-bg-secondary, #1a1a2e);
    border: 1px solid var(--tb-border-hover, #3a3a5e);
    border-radius: var(--tb-radius-lg, 12px);
    width: 100%; max-width: 640px; max-height: 90vh;
    overflow-y: auto; padding: 24px;
    font-family: var(--tb-font-family, system-ui, -apple-system, sans-serif);
    color: var(--tb-text-primary, #e0e0e0);
    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    animation: tracebug-qb-slide-up 0.2s ease;
  `;
    const ssCount = screenshots2.length;
    const ssCountLabel = ssCount === 0 ? "No screenshots" : `${ssCount} screenshot${ssCount === 1 ? "" : "s"} attached`;
    const video = getLastVideoRecording();
    const videoBlock = video ? _buildVideoBlock(video) : "";
    modal.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
      <span style="font-size:22px">\u26A1</span>
      <div style="flex:1">
        <div style="font-size:18px;font-weight:700;color:var(--tb-text-primary, #fff)">Bug Ticket \u2014 Review &amp; Export</div>
        <div style="font-size:12px;color:var(--tb-text-muted, #888);margin-top:2px">${ssCountLabel} \xB7 download/copy includes all screenshots</div>
      </div>
      <button data-action="close" aria-label="Close" style="background:none;border:none;color:var(--tb-text-muted, #888);cursor:pointer;font-size:20px;padding:4px 8px;border-radius:6px">\u2715</button>
    </div>

    <label style="font-size:11px;color:var(--tb-text-muted, #888);display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600">Title</label>
    <input
      id="tb-qb-title"
      type="text"
      value="${escapeHtml2(data.title)}"
      style="width:100%;background:var(--tb-bg-primary, #0f0f1a);border:1px solid var(--tb-border, #2a2a3e);border-radius:var(--tb-radius-md, 6px);color:var(--tb-text-primary, #e0e0e0);padding:10px 12px;font-size:13px;font-family:inherit;margin-bottom:14px;outline:none"
    />

    <label style="font-size:11px;color:var(--tb-text-muted, #888);display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600">Description</label>
    <textarea
      id="tb-qb-desc"
      style="width:100%;height:160px;background:var(--tb-bg-primary, #0f0f1a);border:1px solid var(--tb-border, #2a2a3e);border-radius:var(--tb-radius-md, 6px);color:var(--tb-text-primary, #e0e0e0);padding:10px 12px;font-size:12px;font-family:var(--tb-font-mono, monospace);margin-bottom:14px;resize:vertical;outline:none;line-height:1.5"
    >${escapeHtml2(data.description)}</textarea>

    ${primary ? `
      <label style="font-size:11px;color:var(--tb-text-muted, #888);display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600">Screenshots (${ssCount})</label>
      <div style="border:1px solid var(--tb-border, #2a2a3e);border-radius:var(--tb-radius-md, 6px);overflow:hidden;margin-bottom:6px;background:var(--tb-bg-primary, #0f0f1a)">
        <img id="tb-qb-primary-img" src="${primary.dataUrl}" alt="Bug screenshot" style="display:block;max-width:100%;max-height:240px;width:auto;margin:0 auto" />
      </div>
      <div id="tb-qb-primary-meta" style="font-size:10px;color:var(--tb-text-muted, #555);margin-bottom:${ssCount > 1 ? "6" : "16"}px">${escapeHtml2(primary.filename)} \xB7 ${primary.width}x${primary.height}</div>
      ${ssCount > 1 ? `
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px">
          ${screenshots2.map((ss, i) => `
            <button data-thumb-index="${i}" title="${escapeHtml2(ss.filename)}" style="position:relative;padding:0;border:1px solid var(--tb-border, #2a2a3e);border-radius:4px;overflow:hidden;cursor:pointer;background:var(--tb-bg-primary, #0f0f1a);width:64px;height:48px">
              <img src="${ss.dataUrl}" alt="Step ${i + 1}" style="width:100%;height:100%;object-fit:cover;display:block" />
              <span style="position:absolute;top:1px;left:2px;font-size:9px;font-weight:700;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,0.8);background:rgba(0,0,0,0.5);border-radius:3px;padding:0 4px">${i + 1}</span>
            </button>
          `).join("")}
        </div>
      ` : ""}
    ` : `<div style="font-size:11px;color:var(--tb-text-muted, #666);margin-bottom:16px;padding:10px;background:var(--tb-bg-primary, #0f0f1a);border:1px dashed var(--tb-border, #2a2a3e);border-radius:var(--tb-radius-md, 6px);text-align:center">No screenshots attached \u2014 take one from the toolbar to add to this ticket</div>`}

    ${videoBlock}

    ${_githubRepo ? `
      <button data-action="open-github" style="width:100%;background:#24292e;color:#fff;border:none;border-radius:var(--tb-radius-md, 6px);padding:14px;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit;margin-bottom:8px;transition:opacity 0.15s;display:flex;align-items:center;justify-content:center;gap:8px">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
        Open in GitHub (${escapeHtml2(_githubRepo)})
      </button>
    ` : ""}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
      <button data-action="github" style="background:var(--tb-accent, #7B61FF);color:#fff;border:none;border-radius:var(--tb-radius-md, 6px);padding:12px;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit;transition:opacity 0.15s">\u{1F419} Copy as GitHub Issue</button>
      <button data-action="jira" style="background:${isPremium() ? "#2684FF" : "var(--tb-bg-primary, #0f0f1a)"};color:${isPremium() ? "#fff" : "var(--tb-text-muted, #888)"};border:${isPremium() ? "none" : "1px solid var(--tb-border, #2a2a3e)"};border-radius:var(--tb-radius-md, 6px);padding:12px;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit;transition:opacity 0.15s">${isPremium() ? "\u{1F3AB} Copy as Jira Ticket" : "\u{1F512} Jira Ticket (Premium)"}</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <button data-action="text" style="background:transparent;color:var(--tb-text-primary, #e0e0e0);border:1px solid var(--tb-border, #2a2a3e);border-radius:var(--tb-radius-md, 6px);padding:10px;cursor:pointer;font-size:12px;font-family:inherit;transition:all 0.15s">\u{1F4CB} Copy as Plain Text</button>
      <button data-action="download" style="background:transparent;color:var(--tb-text-primary, #e0e0e0);border:1px solid var(--tb-border, #2a2a3e);border-radius:var(--tb-radius-md, 6px);padding:10px;cursor:pointer;font-size:12px;font-family:inherit;transition:all 0.15s" ${ssCount > 0 ? "" : "disabled"}>\u2B07 Download ${ssCount > 1 ? `All ${ssCount} Screenshots` : "Screenshot"}</button>
    </div>

    <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--tb-border, #2a2a3e);display:flex;align-items:center;justify-content:space-between;font-size:10px;color:var(--tb-text-muted, #555)">
      <span>Tip: <kbd style="background:var(--tb-bg-primary, #0f0f1a);padding:2px 6px;border-radius:3px;border:1px solid var(--tb-border, #2a2a3e);font-family:monospace">Ctrl+Shift+B</kbd> to quick-capture anytime</span>
      <span style="display:flex;align-items:center;gap:8px"><span>Draft auto-saved</span><span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:8px;${isPremium() ? "background:var(--tb-accent, #7B61FF);color:#fff" : "background:var(--tb-border, #2a2a3e);color:var(--tb-text-secondary, #aaa)"}">${isPremium() ? "\u2728 Premium" : "Free"}</span></span>
    </div>
  `;
    overlay.appendChild(modal);
    root.appendChild(overlay);
    _injectStyles();
    setTimeout(() => {
      const titleInput = modal.querySelector("#tb-qb-title");
      if (titleInput) titleInput.focus();
    }, 50);
    const getDraft = () => {
      const titleEl = modal.querySelector("#tb-qb-title");
      const descEl = modal.querySelector("#tb-qb-desc");
      return { title: (titleEl == null ? void 0 : titleEl.value) || "", description: (descEl == null ? void 0 : descEl.value) || "" };
    };
    const saveDraft = () => {
      const { title, description } = getDraft();
      _saveDraft({ title, description, timestamp: Date.now() });
    };
    let saveTimer;
    modal.querySelector("#tb-qb-title").addEventListener("input", () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveDraft, 500);
    });
    modal.querySelector("#tb-qb-desc").addEventListener("input", () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveDraft, 500);
    });
    const close = () => {
      _isOpen = false;
      overlay.remove();
      document.removeEventListener("keydown", escHandler);
    };
    modal.querySelector('[data-action="close"]').addEventListener("click", close);
    overlay.addEventListener("click", (e2) => {
      if (e2.target === overlay) close();
    });
    const escHandler = (e2) => {
      if (e2.key === "Escape") close();
    };
    document.addEventListener("keydown", escHandler);
    const openGhBtn = modal.querySelector('[data-action="open-github"]');
    if (openGhBtn && _githubRepo) {
      openGhBtn.addEventListener("click", () => {
        const { title, description } = getDraft();
        const sessions = getAllSessions().sort((a2, b) => b.updatedAt - a2.updatedAt);
        const session = sessions[0];
        const report = session ? buildReport(session) : null;
        if (!report) {
          showToast("No session data yet", root);
          return;
        }
        report.title = title;
        const repo = _githubRepo;
        const ok = openGitHubIssue(repo, { ...report, steps: `${description}

---

${report.steps}` });
        if (ok) {
          const tail = screenshots2.length ? ` \xB7 ${screenshots2.length} screenshot${screenshots2.length === 1 ? "" : "s"} downloading` : "";
          showToast(`\u2713 GitHub issue page opened${tail}`, root);
          if (screenshots2.length) _downloadAllScreenshots(screenshots2);
          _downloadVideoIfPresent();
          _clearDraft();
          setTimeout(close, 300);
        } else {
          showToast("Failed to open GitHub \u2014 use Copy instead", root);
        }
      });
    }
    modal.querySelector('[data-action="github"]').addEventListener("click", async () => {
      const { title, description } = getDraft();
      const markdown = _buildGitHubMarkdown(title, description, primary);
      const ok = await _copyToClipboard(markdown);
      const tail = ok && screenshots2.length ? ` \xB7 downloading ${screenshots2.length} screenshot${screenshots2.length === 1 ? "" : "s"}` : "";
      showToast(ok ? `\u2713 Copied as GitHub Issue${tail}` : "Copy failed", root);
      if (ok && screenshots2.length) _downloadAllScreenshots(screenshots2);
      if (ok) _downloadVideoIfPresent();
      _clearDraft();
      setTimeout(close, 300);
    });
    modal.querySelector('[data-action="jira"]').addEventListener("click", async () => {
      if (!isPremium()) {
        showUpgradeModal({
          feature: "Jira ticket export",
          message: "Generate Jira-formatted tickets with priority + labels in one click. Upgrade to unlock."
        }, root);
        return;
      }
      const { title, description } = getDraft();
      const sessions = getAllSessions().sort((a2, b) => b.updatedAt - a2.updatedAt);
      const session = sessions[0];
      let text = `Summary: ${title}

Description:
${description}`;
      if (session) {
        const report = buildReport(session);
        report.title = title;
        const ticket = generateJiraTicket(report);
        text = `Summary: ${ticket.summary}
Priority: ${ticket.priority}
Labels: ${ticket.labels.join(", ")}

${ticket.description}

---
${description}`;
      }
      const ok = await _copyToClipboard(text);
      const jiraTail = ok && screenshots2.length ? ` \xB7 downloading ${screenshots2.length} screenshot${screenshots2.length === 1 ? "" : "s"}` : "";
      showToast(ok ? `\u2713 Copied as Jira Ticket${jiraTail}` : "Copy failed", root);
      if (ok && screenshots2.length) _downloadAllScreenshots(screenshots2);
      if (ok) _downloadVideoIfPresent();
      _clearDraft();
      setTimeout(close, 300);
    });
    modal.querySelector('[data-action="text"]').addEventListener("click", async () => {
      const { title, description } = getDraft();
      const plain = `${title}

${description}`;
      const ok = await _copyToClipboard(plain);
      const textTail = ok && screenshots2.length ? ` \xB7 downloading ${screenshots2.length} screenshot${screenshots2.length === 1 ? "" : "s"}` : "";
      showToast(ok ? `\u2713 Copied as plain text${textTail}` : "Copy failed", root);
      if (ok && screenshots2.length) _downloadAllScreenshots(screenshots2);
      if (ok) _downloadVideoIfPresent();
      _clearDraft();
      setTimeout(close, 300);
    });
    const downloadBtn = modal.querySelector('[data-action="download"]');
    if (downloadBtn && screenshots2.length) {
      downloadBtn.addEventListener("click", () => {
        _downloadAllScreenshots(screenshots2);
        showToast(`\u2713 Downloading ${screenshots2.length} screenshot${screenshots2.length === 1 ? "" : "s"}`, root);
      });
    }
    modal.querySelectorAll("[data-thumb-index]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.thumbIndex);
        const target = screenshots2[idx];
        if (!target) return;
        const img = modal.querySelector("#tb-qb-primary-img");
        const meta = modal.querySelector("#tb-qb-primary-meta");
        if (img) img.src = target.dataUrl;
        if (meta) meta.textContent = `${target.filename} \xB7 ${target.width}x${target.height}`;
      });
    });
    const videoEl = modal.querySelector("#tb-qb-video");
    const videoDownloadBtn = modal.querySelector('[data-action="download-video"]');
    if (videoDownloadBtn && video) {
      videoDownloadBtn.addEventListener("click", () => {
        downloadVideoRecording(video, _videoFilename(video));
        showToast("\u2713 Downloading recording", root);
      });
    }
    if (videoEl) {
      modal.querySelectorAll("[data-video-seek]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const seconds = Number(btn.dataset.videoSeek);
          if (!Number.isFinite(seconds)) return;
          videoEl.currentTime = seconds;
          videoEl.play().catch(() => {
          });
        });
      });
    }
  }
  function _formatVideoTime(ms) {
    const total = Math.max(0, Math.floor(ms / 1e3));
    const m = Math.floor(total / 60).toString().padStart(2, "0");
    const s = (total % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }
  function _formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  function _videoFilename(video) {
    const ext = video.mimeType.includes("mp4") ? "mp4" : "webm";
    const stamp = new Date(video.startedAt).toISOString().replace(/[:.]/g, "-").slice(0, 19);
    return `tracebug-recording-${stamp}.${ext}`;
  }
  function _buildVideoBlock(video) {
    const duration2 = _formatVideoTime(video.durationMs);
    const size = _formatBytes(video.sizeBytes);
    const commentCount = video.comments.length;
    const commentLabel = commentCount === 0 ? "No timestamped comments" : `${commentCount} timestamped comment${commentCount === 1 ? "" : "s"}`;
    const commentsList = commentCount > 0 ? `<div style="display:flex;flex-direction:column;gap:4px;margin-top:8px;max-height:120px;overflow-y:auto;padding-right:4px">
        ${video.comments.map((c) => {
      const seconds = Math.floor(c.offsetMs / 1e3);
      return `<button data-video-seek="${seconds}" style="display:flex;align-items:flex-start;gap:8px;background:var(--tb-bg-primary, #0f0f1a);border:1px solid var(--tb-border, #2a2a3e);border-radius:6px;padding:6px 8px;color:var(--tb-text-primary, #e0e0e0);font-family:inherit;font-size:11px;text-align:left;cursor:pointer;line-height:1.4">
            <span style="font-variant-numeric:tabular-nums;font-weight:600;color:var(--tb-accent, #7B61FF);min-width:38px">${_formatVideoTime(c.offsetMs)}</span>
            <span style="flex:1">${escapeHtml2(c.text)}</span>
          </button>`;
    }).join("")}
      </div>` : "";
    return `
    <label style="font-size:11px;color:var(--tb-text-muted, #888);display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600">Screen Recording</label>
    <div style="border:1px solid var(--tb-border, #2a2a3e);border-radius:var(--tb-radius-md, 6px);overflow:hidden;margin-bottom:6px;background:var(--tb-bg-primary, #0f0f1a)">
      <video id="tb-qb-video" controls preload="metadata" src="${video.url}" style="display:block;width:100%;max-height:280px;background:#000"></video>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:10px;color:var(--tb-text-muted, #555);margin-bottom:8px">
      <span>${duration2} \xB7 ${size} \xB7 ${commentLabel}</span>
      <button data-action="download-video" style="background:transparent;color:var(--tb-text-primary, #e0e0e0);border:1px solid var(--tb-border, #2a2a3e);border-radius:6px;padding:5px 10px;cursor:pointer;font-size:11px;font-family:inherit">\u2B07 Download .${video.mimeType.includes("mp4") ? "mp4" : "webm"}</button>
    </div>
    ${commentsList}
    <div style="height:14px"></div>
  `;
  }
  function _buildGitHubMarkdown(title, description, screenshot) {
    const sessions = getAllSessions().sort((a2, b) => b.updatedAt - a2.updatedAt);
    const session = sessions[0];
    if (session) {
      const report = buildReport(session);
      report.title = title;
      const md = generateGitHubIssue(report);
      return `# ${title}

${description}

---

${md.replace(/^#[^\n]*\n/, "")}`;
    }
    return `# ${title}

${description}${screenshot ? `

_Screenshot attached: ${screenshot.filename}_` : ""}`;
  }
  async function _copyToClipboard(text) {
    var _a;
    try {
      if ((_a = navigator.clipboard) == null ? void 0 : _a.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e2) {
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;left:-9999px;top:0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (e2) {
      return false;
    }
  }
  function _loadDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      const draft = JSON.parse(raw);
      if (Date.now() - draft.timestamp > 36e5) return null;
      return draft;
    } catch (e2) {
      return null;
    }
  }
  function _saveDraft(draft) {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch (e2) {
    }
  }
  function _clearDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch (e2) {
    }
  }
  function _injectStyles() {
    if (document.getElementById("tracebug-qb-styles")) return;
    const style = document.createElement("style");
    style.id = "tracebug-qb-styles";
    style.textContent = `
    @keyframes tracebug-qb-fade-in {
      from { opacity: 0; } to { opacity: 1; }
    }
    @keyframes tracebug-qb-slide-up {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    #${MODAL_ID2} button:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
    #${MODAL_ID2} button:disabled { opacity: 0.4; cursor: not-allowed; }
    #${MODAL_ID2} input:focus, #${MODAL_ID2} textarea:focus {
      border-color: var(--tb-accent, #7B61FF) !important;
      box-shadow: 0 0 0 2px var(--tb-accent, #7B61FF)33;
    }
  `;
    document.head.appendChild(style);
  }
  var _githubRepo, MODAL_ID2, DRAFT_KEY, _isOpen;
  var init_quick_bug = __esm({
    "src/ui/quick-bug.ts"() {
      "use strict";
      init_screenshot();
      init_plan();
      init_upgrade_modal();
      init_storage();
      init_video_recorder();
      init_report_builder();
      init_github_issue();
      init_jira_issue();
      init_title_generator();
      init_environment();
      init_toast();
      init_helpers();
      _githubRepo = null;
      MODAL_ID2 = "tracebug-quick-bug-modal";
      DRAFT_KEY = "tracebug_last_bug_draft";
      _isOpen = false;
    }
  });

  // src/index.ts
  var src_exports = {};
  __export(src_exports, {
    FREE_LIMITS: () => FREE_LIMITS,
    buildReport: () => buildReport,
    buildTimeline: () => buildTimeline,
    captureEnvironment: () => captureEnvironment,
    captureRegionScreenshot: () => captureRegionScreenshot,
    captureScreenshot: () => captureScreenshot,
    clearAllSessions: () => clearAllSessions,
    clearVideoRecording: () => clearVideoRecording,
    clearVoiceTranscripts: () => clearVoiceTranscripts,
    default: () => src_default,
    deleteSession: () => deleteSession,
    downloadAllScreenshots: () => downloadAllScreenshots,
    downloadPdfAsHtml: () => downloadPdfAsHtml,
    downloadVideoRecording: () => downloadVideoRecording,
    extractClickedElement: () => extractClickedElement,
    formatRootCauseLine: () => formatRootCauseLine,
    formatTimelineText: () => formatTimelineText,
    generateBugTitle: () => generateBugTitle,
    generateFlowSummary: () => generateFlowSummary,
    generateGitHubIssue: () => generateGitHubIssue,
    generateGitHubIssueUrl: () => generateGitHubIssueUrl,
    generateJiraTicket: () => generateJiraTicket,
    generatePdfReport: () => generatePdfReport,
    generateReproSteps: () => generateReproSteps,
    generateRootCauseHint: () => generateRootCauseHint,
    generateSessionSteps: () => generateSessionSteps,
    generateSmartSummary: () => generateSmartSummary,
    getAllSessions: () => getAllSessions,
    getLastVideoRecording: () => getLastVideoRecording,
    getNetworkFailures: () => getNetworkFailures,
    getPlan: () => getPlan,
    getScreenshots: () => getScreenshots,
    getVoiceTranscripts: () => getVoiceTranscripts,
    hydratePlan: () => hydratePlan,
    isPremium: () => isPremium,
    isVideoRecording: () => isVideoRecording,
    isVideoSupportedFn: () => isVideoSupported,
    isVoiceRecording: () => isVoiceRecording,
    isVoiceSupported: () => isVoiceSupported,
    openGitHubIssue: () => openGitHubIssue,
    setPlan: () => setPlan,
    startVideoRecording: () => startVideoRecording,
    startVoiceRecording: () => startVoiceRecording,
    stopVideoRecording: () => stopVideoRecording,
    stopVoiceRecording: () => stopVoiceRecording
  });
  init_storage();
  init_repro_generator();

  // src/dashboard.ts
  init_storage();
  init_screenshot();
  init_collectors();
  init_report_builder();
  init_github_issue();
  init_jira_issue();

  // src/pdf-generator.ts
  init_report_builder();
  function generatePdfReport(report) {
    const html = buildPdfHtml(report);
    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) {
      downloadAsHtml(html, `tracebug-report-${report.session.sessionId.slice(0, 8)}.html`);
      return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
      }, 300);
    };
  }
  function downloadPdfAsHtml(report) {
    const html = buildPdfHtml(report);
    downloadAsHtml(html, `tracebug-report-${report.session.sessionId.slice(0, 8)}.html`);
  }
  function buildPdfHtml(report) {
    var _a;
    const env = report.environment;
    const session = report.session;
    const hasError = report.consoleErrors.length > 0;
    let html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>TraceBug Report \u2014 ${escapeHtml(report.title)}</title>
<style>
  @page { margin: 20mm 15mm; size: A4; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
    .page-break { page-break-before: always; }
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; color: #1a1a2e; line-height: 1.5; padding: 24px; max-width: 800px; margin: 0 auto; }
  h1 { font-size: 20px; color: #0f0f1a; margin-bottom: 4px; border-bottom: 2px solid #ef4444; padding-bottom: 8px; }
  h2 { font-size: 15px; color: #1a1a2e; margin: 20px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #e0e0e0; }
  .meta { color: #666; font-size: 11px; margin-bottom: 16px; }
  .badge { display: inline-block; font-size: 10px; padding: 2px 8px; border-radius: 4px; font-weight: 600; }
  .badge-error { background: #fee2e2; color: #dc2626; }
  .badge-success { background: #dcfce7; color: #16a34a; }
  .badge-warn { background: #fef3c7; color: #d97706; }
  .env-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin: 12px 0; }
  .env-item { background: #f8f9fa; border: 1px solid #e0e0e0; border-radius: 6px; padding: 8px; }
  .env-label { font-size: 9px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
  .env-value { font-size: 13px; color: #1a1a2e; margin-top: 2px; }
  .steps { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px; margin: 12px 0; }
  .steps pre { white-space: pre-wrap; font-size: 12px; line-height: 1.8; font-family: inherit; }
  .error-box { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 14px; margin: 12px 0; }
  .error-msg { color: #dc2626; font-size: 13px; font-weight: 500; margin-bottom: 6px; }
  .stack { font-family: monospace; font-size: 10px; color: #666; white-space: pre-wrap; max-height: 150px; overflow: auto; background: #fff5f5; padding: 8px; border-radius: 4px; margin-top: 6px; }
  .network-table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 11px; }
  .network-table th { background: #f1f5f9; padding: 6px 8px; text-align: left; font-weight: 600; border-bottom: 2px solid #e2e8f0; }
  .network-table td { padding: 5px 8px; border-bottom: 1px solid #f1f5f9; }
  .network-table tr.error td { background: #fef2f2; }
  .timeline { margin: 12px 0; }
  .timeline-item { display: flex; gap: 12px; padding: 6px 0; border-bottom: 1px solid #f8f9fa; font-size: 11px; }
  .timeline-time { color: #888; font-family: monospace; min-width: 70px; }
  .timeline-type { min-width: 90px; font-weight: 600; }
  .timeline-desc { color: #444; flex: 1; }
  .timeline-item.error { background: #fef2f2; }
  .timeline-item.error .timeline-type { color: #dc2626; }
  .annotation { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 10px; margin: 6px 0; }
  .annotation-severity { font-size: 9px; font-weight: 700; text-transform: uppercase; }
  .screenshot-list { margin: 8px 0; }
  .screenshot-item { margin: 12px 0; }
  .screenshot-item img { max-width: 100%; border: 1px solid #e0e0e0; border-radius: 6px; }
  .screenshot-label { font-size: 10px; color: #888; margin-top: 4px; }
  .footer { text-align: center; color: #888; font-size: 10px; margin-top: 24px; padding-top: 12px; border-top: 1px solid #e0e0e0; }
  .print-btn { display: block; margin: 16px auto; padding: 10px 24px; background: #3b82f6; color: white; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; }
  .print-btn:hover { background: #2563eb; }
</style></head><body>`;
    html += `<button class="print-btn no-print" onclick="window.print()">Save as PDF</button>
`;
    html += `<h1>TraceBug Bug Report</h1>
`;
    html += `<div class="meta">${escapeHtml(report.title)} \xB7 ${new Date(report.generatedAt).toLocaleString()}</div>
`;
    const rcLine = formatRootCauseLine(report.rootCause);
    if (rcLine) {
      const conf = ((_a = report.rootCause) == null ? void 0 : _a.confidence) || "low";
      const palette = conf === "high" ? { bg: "#fef2f2", border: "#ef4444", text: "#7f1d1d" } : conf === "medium" ? { bg: "#fff7ed", border: "#f97316", text: "#7c2d12" } : { bg: "#f3f4f6", border: "#9ca3af", text: "#374151" };
      html += `<div style="background:${palette.bg};border-left:4px solid ${palette.border};padding:12px 16px;margin:14px 0;border-radius:6px;font-size:13px;color:${palette.text}"><strong>\u{1F50D} Possible Cause</strong> <span style="opacity:0.7">(${conf} confidence)</span>: ${escapeHtml(report.rootCause.hint)}</div>
`;
    }
    if (report.summary) {
      html += `<div style="background:#eef2ff;border-left:4px solid #6366f1;padding:12px 16px;margin:14px 0;border-radius:6px;font-size:13px;color:#312e81"><strong>TL;DR:</strong> ${escapeHtml(report.summary)}</div>
`;
    }
    if (report.sessionSteps && report.sessionSteps.length > 0) {
      html += `<h2>Recent Actions</h2>
<ol style="margin:6px 0 12px 22px;font-size:12px;line-height:1.7">
`;
      for (const step of report.sessionSteps) {
        html += `<li>${escapeHtml(step)}</li>
`;
      }
      html += `</ol>
`;
    }
    html += `<h2>Environment</h2>
`;
    html += `<div class="env-grid">
    <div class="env-item"><div class="env-label">Browser</div><div class="env-value">${escapeHtml(env.browser)} ${escapeHtml(env.browserVersion)}</div></div>
    <div class="env-item"><div class="env-label">OS</div><div class="env-value">${escapeHtml(env.os)}</div></div>
    <div class="env-item"><div class="env-label">Viewport</div><div class="env-value">${escapeHtml(env.viewport)}</div></div>
    <div class="env-item"><div class="env-label">Device</div><div class="env-value">${env.deviceType}</div></div>
    <div class="env-item"><div class="env-label">Connection</div><div class="env-value">${escapeHtml(env.connectionType)}</div></div>
    <div class="env-item"><div class="env-label">URL</div><div class="env-value" style="word-break:break-all;font-size:10px">${escapeHtml(env.url)}</div></div>
  </div>
`;
    html += `<h2>Steps to Reproduce</h2>
`;
    if (report.steps) {
      html += `<div class="steps"><pre>${escapeHtml(report.steps)}</pre></div>
`;
    } else {
      html += `<p style="color:#888">No steps recorded</p>
`;
    }
    if (report.annotations.length > 0) {
      html += `<h2>Tester Notes</h2>
`;
      for (const note of report.annotations) {
        const severityColor = note.severity === "critical" ? "#dc2626" : note.severity === "major" ? "#d97706" : note.severity === "minor" ? "#2563eb" : "#666";
        html += `<div class="annotation">
        <span class="annotation-severity" style="color:${severityColor}">${note.severity}</span>
        <div style="margin-top:4px">${escapeHtml(note.text)}</div>
        ${note.expected ? `<div style="margin-top:4px"><strong>Expected:</strong> ${escapeHtml(note.expected)}</div>` : ""}
        ${note.actual ? `<div style="margin-top:2px"><strong>Actual:</strong> ${escapeHtml(note.actual)}</div>` : ""}
      </div>
`;
      }
    }
    if (report.voiceTranscripts && report.voiceTranscripts.length > 0) {
      html += `<h2>Bug Description (Voice)</h2>
`;
      for (const vt of report.voiceTranscripts) {
        html += `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px;margin:8px 0;font-style:italic;color:#92400e">
        <span style="font-size:16px;margin-right:6px">\u{1F3A4}</span> ${escapeHtml(vt.text)}
      </div>
`;
      }
    }
    if (report.consoleErrors.length > 0) {
      html += `<h2>Console Errors <span class="badge badge-error">${report.consoleErrors.length}</span></h2>
`;
      for (const err of report.consoleErrors) {
        html += `<div class="error-box">
        <div class="error-msg">${escapeHtml(err.message)}</div>
        ${err.stack ? `<div class="stack">${escapeHtml(err.stack)}</div>` : ""}
      </div>
`;
      }
    }
    if (report.networkErrors.length > 0) {
      html += `<h2>Failed Network Requests <span class="badge badge-error">${report.networkErrors.length}</span></h2>
`;
      html += `<table class="network-table">
      <thead><tr><th>Method</th><th>URL</th><th>Status</th><th>Duration</th></tr></thead>
      <tbody>
`;
      for (const req of report.networkErrors) {
        const status = req.status === 0 ? "Network Error" : String(req.status);
        html += `<tr class="error"><td>${req.method}</td><td style="word-break:break-all">${escapeHtml(req.url.slice(0, 80))}</td><td>${status}</td><td>${req.duration}ms</td></tr>
`;
      }
      html += `</tbody></table>
`;
      const withBody = report.networkErrors.filter((r) => r.response && r.response.length > 0);
      if (withBody.length > 0) {
        html += `<h2 style="font-size:13px;margin-top:10px">Response Snippets</h2>
`;
        for (const req of withBody) {
          const status = req.status === 0 ? "Network Error" : String(req.status);
          html += `<div style="margin:6px 0;font-family:monospace;font-size:10px"><div style="color:#666;margin-bottom:2px">${escapeHtml(req.method)} ${escapeHtml(req.url.slice(0, 80))} \u2192 ${status}</div><div class="stack" style="background:#fff5f5">${escapeHtml(req.response || "")}</div></div>
`;
        }
      }
    }
    if (report.video) {
      const v = report.video;
      const ext = v.mimeType.includes("mp4") ? "mp4" : "webm";
      const stamp = new Date(v.startedAt).toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const filename = `tracebug-recording-${stamp}.${ext}`;
      const sec = Math.max(0, Math.floor(v.durationMs / 1e3));
      const dur = `${Math.floor(sec / 60).toString().padStart(2, "0")}:${(sec % 60).toString().padStart(2, "0")}`;
      const sizeMb = (v.sizeBytes / (1024 * 1024)).toFixed(1);
      html += `<h2>Screen Recording</h2>
`;
      html += `<div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:8px;padding:14px;margin:8px 0">
      <div style="font-size:13px;color:#1e40af;font-weight:600;margin-bottom:4px">\u{1F4F9} ${escapeHtml(filename)}</div>
      <div style="font-size:11px;color:#475569">Duration ${dur} \xB7 ${sizeMb} MB \xB7 attached as separate file</div>
    </div>
`;
      if (v.comments.length > 0) {
        html += `<h2 style="font-size:13px;margin-top:10px">Timestamped Comments</h2>
<div class="timeline">
`;
        for (const c of v.comments) {
          const cs = Math.max(0, Math.floor(c.offsetMs / 1e3));
          const off = `${Math.floor(cs / 60).toString().padStart(2, "0")}:${(cs % 60).toString().padStart(2, "0")}`;
          html += `<div class="timeline-item">
          <span class="timeline-time">${off}</span>
          <span class="timeline-desc">${escapeHtml(c.text)}</span>
        </div>
`;
        }
        html += `</div>
`;
      }
    }
    if (report.screenshots.length > 0) {
      html += `<h2>Screenshots</h2>
<div class="screenshot-list">
`;
      for (const ss of report.screenshots) {
        html += `<div class="screenshot-item">
        <div class="screenshot-label">${escapeHtml(ss.filename)} \u2014 ${escapeHtml(ss.eventContext)}</div>
        <img src="${ss.dataUrl}" alt="${escapeHtml(ss.filename)}" />
      </div>
`;
      }
      html += `</div>
`;
    }
    if (report.timeline.length > 0) {
      html += `<h2>Session Timeline (${report.timeline.length} events)</h2>
<div class="timeline">
`;
      for (const entry of report.timeline) {
        const errClass = entry.isError ? " error" : "";
        html += `<div class="timeline-item${errClass}">
        <span class="timeline-time">${escapeHtml(entry.elapsed)}</span>
        <span class="timeline-type">${escapeHtml(entry.type)}</span>
        <span class="timeline-desc">${escapeHtml(entry.description)}</span>
      </div>
`;
      }
      html += `</div>
`;
    }
    html += `<div class="footer">Generated by TraceBug SDK \xB7 Session: ${session.sessionId.slice(0, 8)} \xB7 ${new Date(report.generatedAt).toLocaleString()}</div>
`;
    html += `</body></html>`;
    return html;
  }
  function downloadAsHtml(html, filename) {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a2 = document.createElement("a");
    a2.href = url;
    a2.download = filename;
    document.body.appendChild(a2);
    a2.click();
    document.body.removeChild(a2);
    URL.revokeObjectURL(url);
  }
  function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // src/dashboard.ts
  init_title_generator();
  init_voice_recorder();

  // src/annotation-store.ts
  var _elementAnnotations = [];
  var _drawRegions = [];
  function addElementAnnotation(ann) {
    _elementAnnotations.push(ann);
  }
  function addDrawRegion(region) {
    _drawRegions.push(region);
  }
  function removeAnnotationById(id) {
    _elementAnnotations = _elementAnnotations.filter((a2) => a2.id !== id);
    _drawRegions = _drawRegions.filter((r) => r.id !== id);
  }
  function getElementAnnotations() {
    return _elementAnnotations;
  }
  function getDrawRegions() {
    return _drawRegions;
  }
  function getAnnotationReport() {
    return {
      elementAnnotations: [..._elementAnnotations],
      drawRegions: [..._drawRegions],
      page: typeof window !== "undefined" ? window.location.pathname : "",
      timestamp: Date.now()
    };
  }
  function clearAllAnnotations() {
    _elementAnnotations = [];
    _drawRegions = [];
  }
  function getAnnotationCount() {
    return _elementAnnotations.length + _drawRegions.length;
  }
  function exportAsJSON() {
    return JSON.stringify(getAnnotationReport(), null, 2);
  }
  function exportAsMarkdown() {
    const lines = [];
    lines.push("# UI Annotations Report");
    lines.push(`**Page:** ${window.location.href}`);
    lines.push(`**Date:** ${(/* @__PURE__ */ new Date()).toISOString()}`);
    lines.push(`**Total:** ${_elementAnnotations.length} element annotations, ${_drawRegions.length} draw regions`);
    lines.push("");
    if (_elementAnnotations.length > 0) {
      lines.push("## Element Annotations");
      lines.push("");
      for (let i = 0; i < _elementAnnotations.length; i++) {
        const a2 = _elementAnnotations[i];
        const intentLabel = a2.intent.charAt(0).toUpperCase() + a2.intent.slice(1);
        const sevLabel = a2.severity.charAt(0).toUpperCase() + a2.severity.slice(1);
        lines.push(`### ${i + 1}. [${intentLabel.toUpperCase()}] \`${a2.selector.slice(0, 60)}\` (${sevLabel})`);
        lines.push(`- **Element:** \`<${a2.tagName}>\` "${a2.innerText.slice(0, 80)}"`);
        lines.push(`- **Comment:** ${a2.comment}`);
        lines.push(`- **Page:** ${a2.page}`);
        lines.push("");
      }
    }
    if (_drawRegions.length > 0) {
      lines.push("## Draw Regions");
      lines.push("");
      for (let i = 0; i < _drawRegions.length; i++) {
        const r = _drawRegions[i];
        const shapeLabel = r.shape === "rect" ? "Rectangle" : "Ellipse";
        lines.push(`### ${i + 1}. ${shapeLabel} at (${Math.round(r.x)}, ${Math.round(r.y)}) ${Math.round(r.width)}x${Math.round(r.height)}`);
        lines.push(`- **Comment:** ${r.comment || "(no comment)"}`);
        lines.push(`- **Page:** ${r.page}`);
        lines.push("");
      }
    }
    return lines.join("\n");
  }
  async function copyToClipboard(format) {
    const text = format === "json" ? exportAsJSON() : exportAsMarkdown();
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e2) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;left:-9999px";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        return true;
      } catch (e3) {
        return false;
      } finally {
        ta.remove();
      }
    }
  }

  // src/element-annotate.ts
  init_helpers();
  var _active = false;
  var _cleanup = null;
  var _selectedElements = /* @__PURE__ */ new Map();
  var _highlightOverlay = null;
  var _selectionOverlays = [];
  var _popover = null;
  var _modeBanner = null;
  var _counter = 0;
  var _onUpdate = null;
  var _onDeactivate = null;
  var _persistentBadges = [];
  var _badgeRoot = null;
  var HIGHLIGHT_COLOR = "#7B61FF";
  var SELECTION_COLOR = "#00E5FF";
  function isElementAnnotateActive() {
    return _active;
  }
  function activateElementAnnotateMode(root, onUpdate, onDeactivate) {
    if (_active) return;
    _active = true;
    _onUpdate = onUpdate || null;
    _onDeactivate = onDeactivate || null;
    _badgeRoot = root;
    _counter = 0;
    _selectedElements.clear();
    _modeBanner = document.createElement("div");
    _modeBanner.id = "tracebug-annotate-banner";
    _modeBanner.dataset.tracebug = "annotate-banner";
    _modeBanner.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; z-index: 2147483647;
    background: linear-gradient(90deg, var(--tb-gradient-start, #7B61FF), var(--tb-gradient-end, #5B3FDF)); color: #fff;
    padding: 10px 20px; font-family: var(--tb-font-family, system-ui, -apple-system, sans-serif);
    font-size: 13px; display: flex; align-items: center; justify-content: space-between;
    box-shadow: 0 2px 12px rgba(123, 97, 255, 0.3);
    animation: tracebug-slide-down 0.2s ease;
  `;
    _modeBanner.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px">
      <div style="width:8px;height:8px;border-radius:50%;background:#fff;animation:tracebug-pulse 1.5s infinite"></div>
      <span style="font-weight:600">Annotate Mode</span>
      <span style="opacity:0.7;font-size:12px">Click an element to annotate it. Hold Shift to select multiple.</span>
    </div>
    <div style="display:flex;align-items:center;gap:8px">
      <span style="opacity:0.5;font-size:11px">Esc to exit</span>
      <button id="tracebug-annotate-exit" data-tracebug="annotate-exit" style="
        background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3);
        color: #fff; padding: 5px 14px; border-radius: 6px; cursor: pointer;
        font-size: 12px; font-family: inherit; font-weight: 500;
      ">Exit</button>
    </div>
  `;
    const styleTag = document.createElement("style");
    styleTag.id = "tracebug-annotate-styles";
    styleTag.dataset.tracebug = "annotate-styles";
    styleTag.textContent = `
    @keyframes tracebug-slide-down { from { transform: translateY(-100%); } to { transform: translateY(0); } }
    @keyframes tracebug-pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
  `;
    document.head.appendChild(styleTag);
    root.appendChild(_modeBanner);
    _modeBanner.querySelector("#tracebug-annotate-exit").addEventListener("click", (e2) => {
      e2.stopPropagation();
      deactivateElementAnnotateMode();
    });
    _highlightOverlay = document.createElement("div");
    _highlightOverlay.id = "tracebug-element-highlight";
    _highlightOverlay.dataset.tracebug = "element-highlight";
    _highlightOverlay.style.cssText = `
    position: fixed; pointer-events: none; z-index: 2147483646;
    border: 2px solid ${HIGHLIGHT_COLOR}; background: rgba(123, 97, 255, 0.08);
    border-radius: 3px; transition: all 0.08s ease; display: none;
  `;
    root.appendChild(_highlightOverlay);
    const savedOverflowHtml = document.documentElement.style.overflow;
    const savedOverflowBody = document.body.style.overflow;
    const savedScrollY = window.scrollY;
    const savedScrollX = window.scrollX;
    document.documentElement.style.setProperty("overflow", "hidden", "important");
    document.body.style.setProperty("overflow", "hidden", "important");
    const preventScroll = (e2) => {
      e2.preventDefault();
    };
    window.addEventListener("wheel", preventScroll, { passive: false, capture: true });
    window.addEventListener("touchmove", preventScroll, { passive: false, capture: true });
    const onMouseMove = (e2) => {
      if (!_active || !_highlightOverlay) return;
      if (_popover) return;
      const el = document.elementFromPoint(e2.clientX, e2.clientY);
      if (!el || _isOurElement(el)) {
        _highlightOverlay.style.display = "none";
        document.body.style.cursor = "default";
        return;
      }
      document.body.style.cursor = "crosshair";
      const rect = el.getBoundingClientRect();
      _highlightOverlay.style.display = "block";
      _highlightOverlay.style.left = rect.left + "px";
      _highlightOverlay.style.top = rect.top + "px";
      _highlightOverlay.style.width = rect.width + "px";
      _highlightOverlay.style.height = rect.height + "px";
    };
    const onClick = (e2) => {
      if (!_active) return;
      const target = e2.target;
      if (target && _isOurElement(target)) return;
      if (_popover) {
        _popover.remove();
        _popover = null;
        e2.preventDefault();
        e2.stopPropagation();
        return;
      }
      e2.preventDefault();
      e2.stopPropagation();
      e2.stopImmediatePropagation();
      const el = document.elementFromPoint(e2.clientX, e2.clientY);
      if (!el || _isOurElement(el)) return;
      const selector = _computeSelector(el);
      if (e2.shiftKey) {
        if (!_selectedElements.has(selector)) {
          _counter++;
          _selectedElements.set(selector, { element: el, rect: el.getBoundingClientRect(), index: _counter });
          _renderSelectionOverlay(el, _counter, root);
          _updateBannerCount();
        }
      } else {
        _clearSelections();
        _counter++;
        _selectedElements.set(selector, { element: el, rect: el.getBoundingClientRect(), index: _counter });
        _renderSelectionOverlay(el, _counter, root);
        _showFeedbackPopover(el, root);
      }
    };
    const onContext = (e2) => {
      if (!_active) return;
      if (_selectedElements.size > 0) {
        e2.preventDefault();
        const firstEntry = _selectedElements.values().next().value;
        if (firstEntry) {
          _showFeedbackPopover(firstEntry.element, root);
        }
      }
    };
    const onKeyDown = (e2) => {
      if (e2.key === "Escape") {
        e2.preventDefault();
        if (_popover) {
          _popover.remove();
          _popover = null;
          _clearSelections();
        } else {
          deactivateElementAnnotateMode();
        }
      }
    };
    document.addEventListener("mousemove", onMouseMove, { capture: true });
    document.addEventListener("click", onClick, { capture: true });
    document.addEventListener("contextmenu", onContext, { capture: true });
    document.addEventListener("keydown", onKeyDown, { capture: true });
    _cleanup = () => {
      var _a;
      _active = false;
      document.removeEventListener("mousemove", onMouseMove, { capture: true });
      document.removeEventListener("click", onClick, { capture: true });
      document.removeEventListener("contextmenu", onContext, { capture: true });
      document.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("wheel", preventScroll, { capture: true });
      window.removeEventListener("touchmove", preventScroll, { capture: true });
      document.documentElement.style.overflow = savedOverflowHtml;
      document.body.style.overflow = savedOverflowBody;
      document.body.style.cursor = "";
      window.scrollTo(savedScrollX, savedScrollY);
      _highlightOverlay == null ? void 0 : _highlightOverlay.remove();
      _highlightOverlay = null;
      _modeBanner == null ? void 0 : _modeBanner.remove();
      _modeBanner = null;
      (_a = document.getElementById("tracebug-annotate-styles")) == null ? void 0 : _a.remove();
      _clearSelections();
      _popover == null ? void 0 : _popover.remove();
      _popover = null;
      _onUpdate = null;
      if (_badgeRoot) _refreshPersistentBadges(_badgeRoot);
      if (_onDeactivate) _onDeactivate();
      _onDeactivate = null;
    };
  }
  function deactivateElementAnnotateMode() {
    if (_cleanup) {
      _cleanup();
      _cleanup = null;
    }
  }
  function _refreshPersistentBadges(root) {
    _persistentBadges.forEach((b) => b.remove());
    _persistentBadges = [];
    const annotations = getElementAnnotations();
    const page = window.location.pathname;
    const pageAnnotations = annotations.filter((a2) => a2.page === page);
    for (let i = 0; i < pageAnnotations.length; i++) {
      const a2 = pageAnnotations[i];
      const el = document.querySelector(a2.selector);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const outline = document.createElement("div");
      outline.dataset.tracebug = "annotation-outline";
      outline.style.cssText = `
      position: fixed; z-index: 2147483644; pointer-events: none;
      left: ${rect.left - 2}px; top: ${rect.top - 2}px;
      width: ${rect.width + 4}px; height: ${rect.height + 4}px;
      border: 2px dashed ${_intentColor(a2.intent)}80;
      border-radius: 3px;
    `;
      root.appendChild(outline);
      _persistentBadges.push(outline);
      const badge = document.createElement("div");
      badge.dataset.tracebug = "annotation-badge";
      badge.title = `Click to view: ${a2.intent.toUpperCase()} \u2014 ${a2.comment.slice(0, 60)}`;
      badge.style.cssText = `
      position: fixed; z-index: 2147483645; pointer-events: auto; cursor: pointer;
      left: ${rect.right - 10}px; top: ${rect.top - 10}px;
      width: 20px; height: 20px; border-radius: 50%;
      background: ${_intentColor(a2.intent)}; color: #fff;
      font-size: 10px; font-weight: 700; font-family: system-ui, sans-serif;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 1px 6px rgba(0,0,0,0.4);
      transition: transform 0.15s;
    `;
      badge.textContent = String(i + 1);
      badge.addEventListener("mouseenter", () => {
        badge.style.transform = "scale(1.2)";
      });
      badge.addEventListener("mouseleave", () => {
        badge.style.transform = "scale(1)";
      });
      badge.addEventListener("click", (e2) => {
        e2.stopPropagation();
        _showBadgePopover(a2, badge, root);
      });
      root.appendChild(badge);
      _persistentBadges.push(badge);
    }
  }
  function showAnnotationBadges(root) {
    _badgeRoot = root;
    _refreshPersistentBadges(root);
  }
  function clearAnnotationBadges() {
    _persistentBadges.forEach((b) => b.remove());
    _persistentBadges = [];
  }
  function _showBadgePopover(a2, badge, root) {
    const existing = document.getElementById("tracebug-badge-popover");
    if (existing) existing.remove();
    const intentColor = _intentColor(a2.intent);
    const sevColor = a2.severity === "critical" ? "#ef4444" : a2.severity === "major" ? "#f97316" : a2.severity === "minor" ? "#3b82f6" : "#888";
    const badgeRect = badge.getBoundingClientRect();
    const popover = document.createElement("div");
    popover.id = "tracebug-badge-popover";
    popover.dataset.tracebug = "badge-popover";
    const posBelow = badgeRect.bottom + 8;
    const posAbove = badgeRect.top - 8;
    const fitsBelow = posBelow + 180 < window.innerHeight;
    popover.style.cssText = `
    position: fixed; z-index: 2147483647; pointer-events: auto;
    left: ${Math.max(8, Math.min(badgeRect.left - 120, window.innerWidth - 280))}px;
    ${fitsBelow ? `top: ${posBelow}px` : `bottom: ${window.innerHeight - posAbove}px`};
    width: 270px;
    background: var(--tb-bg-secondary, #1a1a2e);
    border: 1px solid var(--tb-border-hover, #3a3a5e);
    border-radius: var(--tb-radius-lg, 12px);
    padding: 14px;
    font-family: var(--tb-font-family, system-ui, -apple-system, sans-serif);
    font-size: 12px;
    color: var(--tb-text-primary, #e0e0e0);
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    animation: tracebug-tooltip-in 0.15s ease;
  `;
    const intentLabel = a2.intent.charAt(0).toUpperCase() + a2.intent.slice(1);
    const sevLabel = a2.severity.charAt(0).toUpperCase() + a2.severity.slice(1);
    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:10px";
    const intentBadge = document.createElement("span");
    intentBadge.style.cssText = `font-size:10px;padding:2px 8px;border-radius:4px;background:${intentColor}22;color:${intentColor};border:1px solid ${intentColor}44;font-weight:600;text-transform:uppercase`;
    intentBadge.textContent = intentLabel;
    const sevBadge = document.createElement("span");
    sevBadge.style.cssText = `font-size:10px;padding:2px 8px;border-radius:4px;background:${sevColor}15;color:${sevColor};font-weight:500`;
    sevBadge.textContent = sevLabel;
    const closeBtn = document.createElement("button");
    closeBtn.dataset.action = "close";
    closeBtn.style.cssText = "margin-left:auto;background:none;border:none;color:var(--tb-text-muted, #666);cursor:pointer;font-size:14px;padding:0 4px";
    closeBtn.textContent = "\u2715";
    closeBtn.title = "Close";
    header.append(intentBadge, sevBadge, closeBtn);
    const commentEl = document.createElement("div");
    commentEl.style.cssText = "font-size:13px;color:var(--tb-text-primary, #e0e0e0);line-height:1.5;word-break:break-word";
    commentEl.textContent = a2.comment;
    popover.append(header, commentEl);
    root.appendChild(popover);
    popover.querySelector('[data-action="close"]').addEventListener("click", () => popover.remove());
    const closeHandler = (ev) => {
      if (!popover.contains(ev.target) && ev.target !== badge) {
        popover.remove();
        document.removeEventListener("click", closeHandler);
      }
    };
    setTimeout(() => document.addEventListener("click", closeHandler), 10);
    const escHandler = (ev) => {
      if (ev.key === "Escape") {
        popover.remove();
        document.removeEventListener("keydown", escHandler);
      }
    };
    document.addEventListener("keydown", escHandler);
  }
  function _updateBannerCount() {
    if (!_modeBanner) return;
    const count = _selectedElements.size;
    if (count > 1) {
      const textEl = _modeBanner.querySelector("span:nth-child(3)");
      if (textEl) textEl.textContent = `${count} elements selected. Right-click to add feedback.`;
    }
  }
  function _isOurElement(el) {
    var _a, _b, _c;
    if (!el) return false;
    if ((_a = el.dataset) == null ? void 0 : _a.tracebug) return true;
    const root = document.getElementById("tracebug-root");
    if (root && root.contains(el)) return true;
    let node = el;
    while (node) {
      if (((_b = node.id) == null ? void 0 : _b.startsWith("tracebug-")) || ((_c = node.id) == null ? void 0 : _c.startsWith("bt-"))) return true;
      const cn = typeof node.className === "string" ? node.className : "";
      if (cn.includes("tracebug-")) return true;
      node = node.parentElement;
    }
    return false;
  }
  function _computeSelector(el) {
    if (el.id && !el.id.startsWith("tracebug-") && !el.id.startsWith("bt-")) {
      return `#${CSS.escape(el.id)}`;
    }
    const testId = el.getAttribute("data-testid");
    if (testId) return `[data-testid="${CSS.escape(testId)}"]`;
    const parts = [];
    let node = el;
    while (node && node !== document.documentElement) {
      let seg = node.tagName.toLowerCase();
      if (node.id && !node.id.startsWith("tracebug-") && !node.id.startsWith("bt-")) {
        parts.unshift(`#${CSS.escape(node.id)}`);
        break;
      }
      const parent = node.parentElement;
      if (parent) {
        const currentTag = node.tagName;
        const siblings = Array.from(parent.children).filter((c) => c.tagName === currentTag);
        if (siblings.length > 1) {
          seg += `:nth-child(${Array.from(parent.children).indexOf(node) + 1})`;
        }
      }
      parts.unshift(seg);
      node = parent;
    }
    return parts.join(" > ");
  }
  function _clearSelections() {
    _selectionOverlays.forEach((o) => o.remove());
    _selectionOverlays = [];
    _selectedElements.clear();
  }
  function _renderSelectionOverlay(el, index, root) {
    const rect = el.getBoundingClientRect();
    const box = document.createElement("div");
    box.dataset.tracebug = "selection-overlay";
    box.style.cssText = `
    position: fixed; z-index: 2147483645; pointer-events: none;
    left: ${rect.left - 2}px; top: ${rect.top - 2}px;
    width: ${rect.width + 4}px; height: ${rect.height + 4}px;
    border: 2px solid ${SELECTION_COLOR}; border-radius: 3px;
    background: rgba(0, 229, 255, 0.06);
    animation: tracebug-slide-down 0.15s ease;
  `;
    const badge = document.createElement("div");
    badge.dataset.tracebug = "selection-badge";
    badge.style.cssText = `
    position: absolute; top: -10px; right: -10px;
    width: 22px; height: 22px; border-radius: 50%;
    background: ${SELECTION_COLOR}; color: #000;
    font-size: 11px; font-weight: 700; font-family: system-ui, sans-serif;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 1px 4px rgba(0,0,0,0.3);
  `;
    badge.textContent = String(index);
    box.appendChild(badge);
    root.appendChild(box);
    _selectionOverlays.push(box);
  }
  function _showFeedbackPopover(targetEl, root) {
    if (_popover) {
      _popover.remove();
      _popover = null;
    }
    const rect = targetEl.getBoundingClientRect();
    const popover = document.createElement("div");
    popover.id = "tracebug-annotate-popover";
    popover.dataset.tracebug = "annotate-popover";
    let top = rect.bottom + 10;
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - 330));
    if (top + 360 > window.innerHeight) {
      top = Math.max(50, rect.top - 370);
    }
    if (top < 50) top = 50;
    popover.style.cssText = `
    position: fixed; z-index: 2147483647;
    left: ${left}px; top: ${top}px; width: 310px;
    background: #1a1a2e; border: 1px solid #3a3a5e; border-radius: 12px;
    padding: 18px; font-family: var(--tb-font-family, system-ui, -apple-system, sans-serif); font-size: 13px;
    color: #e0e0e0; box-shadow: 0 12px 40px rgba(0,0,0,0.5);
    animation: tracebug-slide-down 0.15s ease;
  `;
    const tagText = targetEl.tagName.toLowerCase();
    const previewText = (targetEl.innerText || "").slice(0, 40);
    const selectedCount = _selectedElements.size;
    const selectorText = _computeSelector(targetEl);
    popover.innerHTML = `
    <div style="margin-bottom:14px">
      <div style="font-size:13px;font-weight:600;color:#fff;margin-bottom:4px">
        ${selectedCount > 1 ? `${selectedCount} elements selected` : "Annotate Element"}
      </div>
      <div style="font-size:11px;color:var(--tb-text-muted, #666);font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml2(selectorText)}">
        &lt;${escapeHtml2(tagText)}&gt;${previewText ? ` "${escapeHtml2(previewText)}"` : ""}
      </div>
    </div>

    <div style="margin-bottom:12px">
      <div style="font-size:11px;color:#999;margin-bottom:6px;font-weight:500">What needs to happen?</div>
      <div style="display:flex;gap:5px" id="tracebug-intent-btns">
        <button data-intent="fix" title="This element has a bug that needs fixing" style="${_intentBtnStyle("fix", true)}">Bug Fix</button>
        <button data-intent="redesign" title="This element needs a design or UX change" style="${_intentBtnStyle("redesign", false)}">Redesign</button>
        <button data-intent="remove" title="This element should be removed" style="${_intentBtnStyle("remove", false)}">Remove</button>
        <button data-intent="question" title="I have a question about this element" style="${_intentBtnStyle("question", false)}">Question</button>
      </div>
    </div>

    <div style="margin-bottom:12px">
      <div style="font-size:11px;color:#999;margin-bottom:6px;font-weight:500">Priority</div>
      <select id="tracebug-sev-select" style="width:100%;background:#0f0f1a;border:1px solid var(--tb-border-hover, #3a3a5e);color:var(--tb-text-primary, #e0e0e0);padding:8px 10px;border-radius:var(--tb-radius-md, 8px);font-size:13px;font-family:inherit;cursor:pointer">
        <option value="critical">Critical - Blocks users</option>
        <option value="major">Major - Significant issue</option>
        <option value="minor" selected>Minor - Small improvement</option>
        <option value="info">Info - Just a note</option>
      </select>
    </div>

    <div style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span style="font-size:11px;color:#999;font-weight:500">Describe the issue</span>
        <span id="tracebug-char-count" style="font-size:10px;color:#555">0 / 500</span>
      </div>
      <textarea id="tracebug-ann-comment" rows="4" maxlength="500" placeholder="What's wrong? What should change?&#10;e.g. 'Button text is misleading \u2014 should say Save instead of Submit'" style="width:100%;background:#0f0f1a;border:1px solid var(--tb-border-hover, #3a3a5e);color:var(--tb-text-primary, #e0e0e0);padding:10px;border-radius:var(--tb-radius-md, 8px);font-size:13px;font-family:inherit;resize:vertical;box-sizing:border-box;line-height:1.4"></textarea>
      <div id="tracebug-comment-error" style="font-size:11px;color:#ef4444;margin-top:4px;display:none">Please describe the issue before saving.</div>
    </div>

    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button id="tracebug-ann-cancel" style="background:#ffffff08;border:1px solid var(--tb-border-hover, #3a3a5e);color:var(--tb-text-secondary, #aaa);padding:8px 16px;border-radius:var(--tb-radius-md, 8px);cursor:pointer;font-size:12px;font-family:inherit">Cancel</button>
      <button id="tracebug-ann-save" style="background:#7B61FF;border:none;color:#fff;padding:8px 18px;border-radius:var(--tb-radius-md, 8px);cursor:pointer;font-size:12px;font-weight:600;font-family:inherit;box-shadow:0 2px 8px rgba(123,97,255,0.3)">Save Annotation</button>
    </div>
  `;
    root.appendChild(popover);
    _popover = popover;
    const commentEl = popover.querySelector("#tracebug-ann-comment");
    const charCount = popover.querySelector("#tracebug-char-count");
    const errorEl = popover.querySelector("#tracebug-comment-error");
    setTimeout(() => commentEl == null ? void 0 : commentEl.focus(), 50);
    commentEl.addEventListener("input", () => {
      charCount.textContent = `${commentEl.value.length} / 500`;
      if (commentEl.value.trim()) {
        commentEl.style.borderColor = "#3a3a5e";
        errorEl.style.display = "none";
      }
    });
    let selectedIntent = "fix";
    const intentBtns = popover.querySelectorAll("#tracebug-intent-btns button");
    intentBtns.forEach((btn) => {
      btn.addEventListener("click", (e2) => {
        e2.stopPropagation();
        selectedIntent = btn.dataset.intent;
        intentBtns.forEach((b) => {
          const intent = b.dataset.intent;
          b.style.cssText = _intentBtnStyle(intent, intent === selectedIntent);
        });
      });
    });
    popover.querySelector("#tracebug-ann-cancel").addEventListener("click", (e2) => {
      e2.stopPropagation();
      popover.remove();
      _popover = null;
      _clearSelections();
    });
    popover.querySelector("#tracebug-ann-save").addEventListener("click", (e2) => {
      e2.stopPropagation();
      const severity = popover.querySelector("#tracebug-sev-select").value;
      const comment = commentEl.value.trim();
      if (!comment) {
        commentEl.style.borderColor = "#ef4444";
        errorEl.style.display = "block";
        commentEl.focus();
        return;
      }
      for (const [selector, entry] of _selectedElements) {
        const el = entry.element;
        const bRect = el.getBoundingClientRect();
        const annotation = {
          id: `ea_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          timestamp: Date.now(),
          selector,
          tagName: el.tagName.toLowerCase(),
          innerText: (el.innerText || "").slice(0, 100),
          boundingRect: { x: bRect.x + window.scrollX, y: bRect.y + window.scrollY, width: bRect.width, height: bRect.height },
          intent: selectedIntent,
          severity,
          comment,
          page: window.location.pathname,
          scrollX: window.scrollX,
          scrollY: window.scrollY
        };
        addElementAnnotation(annotation);
      }
      popover.remove();
      _popover = null;
      _clearSelections();
      _refreshPersistentBadges(root);
      if (_onUpdate) _onUpdate();
    });
    popover.addEventListener("click", (e2) => e2.stopPropagation());
    popover.addEventListener("mousedown", (e2) => e2.stopPropagation());
  }
  function _intentBtnStyle(intent, active) {
    const color2 = _intentColor(intent);
    if (active) {
      return `background:${color2}33;color:${color2};border:1px solid ${color2};border-radius:var(--tb-radius-md, 8px);padding:6px 11px;cursor:pointer;font-size:11px;font-weight:600;font-family:inherit;transition:all 0.15s;`;
    }
    return `background:#ffffff06;color:#999;border:1px solid #33333366;border-radius:var(--tb-radius-md, 8px);padding:6px 11px;cursor:pointer;font-size:11px;font-family:inherit;transition:all 0.15s;`;
  }
  function _intentColor(intent) {
    switch (intent) {
      case "fix":
        return "#ef4444";
      case "redesign":
        return "#7B61FF";
      case "remove":
        return "#f97316";
      case "question":
        return "#3b82f6";
    }
  }

  // src/draw-mode.ts
  var _active2 = false;
  var _cleanup2 = null;
  var _currentShape = "rect";
  var _currentColor = "#7B61FF";
  var _onUpdate2 = null;
  var _onDeactivate2 = null;
  var COLORS2 = [
    { value: "#7B61FF", label: "Purple" },
    { value: "#ef4444", label: "Red" },
    { value: "#eab308", label: "Yellow" },
    { value: "#22c55e", label: "Green" },
    { value: "#3b82f6", label: "Blue" }
  ];
  var MAX_CANVAS_DIM = 32767;
  function isDrawModeActive() {
    return _active2;
  }
  function activateDrawMode(root, onUpdate, onDeactivate) {
    if (_active2) return;
    _active2 = true;
    _onUpdate2 = onUpdate || null;
    _onDeactivate2 = onDeactivate || null;
    const docW = Math.min(document.documentElement.scrollWidth, MAX_CANVAS_DIM);
    const docH = Math.min(document.documentElement.scrollHeight, MAX_CANVAS_DIM);
    const canvas = document.createElement("canvas");
    canvas.id = "tracebug-draw-canvas";
    canvas.dataset.tracebug = "draw-canvas";
    canvas.width = docW;
    canvas.height = docH;
    canvas.style.cssText = `
    position: absolute; top: 0; left: 0; z-index: 2147483645;
    width: ${docW}px; height: ${docH}px;
    cursor: crosshair; pointer-events: auto;
  `;
    root.appendChild(canvas);
    const toolbar = _createToolbar(root);
    root.appendChild(toolbar);
    const ctx = canvas.getContext("2d");
    _redrawAllRegions(ctx, docW, docH);
    let isDrawing = false;
    let startX = 0, startY = 0;
    const onMouseDown = (e2) => {
      var _a, _b;
      if (!_active2) return;
      if ((_a = e2.target) == null ? void 0 : _a.closest("#tracebug-draw-toolbar")) return;
      if ((_b = e2.target) == null ? void 0 : _b.closest("[data-tracebug='draw-comment-input']")) return;
      const rect = canvas.getBoundingClientRect();
      startX = e2.clientX - rect.left + window.scrollX;
      startY = e2.clientY - rect.top + window.scrollY;
      isDrawing = true;
    };
    const onMouseMove = (e2) => {
      if (!isDrawing || !_active2) return;
      const rect = canvas.getBoundingClientRect();
      const curX = e2.clientX - rect.left + window.scrollX;
      const curY = e2.clientY - rect.top + window.scrollY;
      _redrawAllRegions(ctx, docW, docH);
      _drawShape(ctx, _currentShape, _currentColor, startX, startY, curX - startX, curY - startY, 0.3);
    };
    const onMouseUp = (e2) => {
      if (!isDrawing || !_active2) return;
      isDrawing = false;
      const rect = canvas.getBoundingClientRect();
      const endX = e2.clientX - rect.left + window.scrollX;
      const endY = e2.clientY - rect.top + window.scrollY;
      const w = endX - startX;
      const h = endY - startY;
      if (Math.abs(w) < 10 && Math.abs(h) < 10) {
        _redrawAllRegions(ctx, docW, docH);
        return;
      }
      const normX = w < 0 ? startX + w : startX;
      const normY = h < 0 ? startY + h : startY;
      const normW = Math.abs(w);
      const normH = Math.abs(h);
      _showCommentInput(normX, normY, normW, normH, root, ctx, docW, docH);
    };
    const onKeyDown = (e2) => {
      if (e2.key === "Escape") {
        e2.preventDefault();
        deactivateDrawMode();
      }
    };
    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keydown", onKeyDown, { capture: true });
    const resizeObserver = new ResizeObserver(() => {
      const newW = Math.min(document.documentElement.scrollWidth, MAX_CANVAS_DIM);
      const newH = Math.min(document.documentElement.scrollHeight, MAX_CANVAS_DIM);
      if (canvas.width !== newW || canvas.height !== newH) {
        canvas.width = newW;
        canvas.height = newH;
        canvas.style.width = newW + "px";
        canvas.style.height = newH + "px";
        _redrawAllRegions(ctx, newW, newH);
      }
    });
    resizeObserver.observe(document.body);
    _cleanup2 = () => {
      _active2 = false;
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("keydown", onKeyDown, { capture: true });
      resizeObserver.disconnect();
      canvas.remove();
      toolbar.remove();
      _onUpdate2 = null;
      if (_onDeactivate2) _onDeactivate2();
      _onDeactivate2 = null;
    };
  }
  function deactivateDrawMode() {
    if (_cleanup2) {
      _cleanup2();
      _cleanup2 = null;
    }
  }
  function _createToolbar(root) {
    const bar = document.createElement("div");
    bar.id = "tracebug-draw-toolbar";
    bar.dataset.tracebug = "draw-toolbar";
    bar.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0;
    z-index: 2147483647; display: flex; align-items: center; gap: 8px;
    background: linear-gradient(90deg, var(--tb-gradient-start, #7B61FF), var(--tb-gradient-end, #5B3FDF));
    padding: 10px 20px; font-family: var(--tb-font-family, system-ui, -apple-system, sans-serif);
    box-shadow: 0 2px 12px rgba(123, 97, 255, 0.3);
    animation: tracebug-draw-slide 0.2s ease;
  `;
    const styleTag = document.createElement("style");
    styleTag.id = "tracebug-draw-styles";
    styleTag.dataset.tracebug = "draw-styles";
    styleTag.textContent = `
    @keyframes tracebug-draw-slide { from { transform: translateY(-100%); } to { transform: translateY(0); } }
  `;
    document.head.appendChild(styleTag);
    const modeLabel = document.createElement("div");
    modeLabel.style.cssText = "display:flex;align-items:center;gap:8px;margin-right:8px";
    modeLabel.innerHTML = `
    <div style="width:8px;height:8px;border-radius:50%;background:#fff;animation:tracebug-pulse 1.5s infinite"></div>
    <span style="color:#fff;font-weight:600;font-size:13px">Draw Mode</span>
  `;
    if (!document.getElementById("tracebug-annotate-styles")) {
      const pulseStyle = document.createElement("style");
      pulseStyle.id = "tracebug-draw-pulse";
      pulseStyle.textContent = `@keyframes tracebug-pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }`;
      document.head.appendChild(pulseStyle);
    }
    bar.appendChild(modeLabel);
    bar.appendChild(_sep());
    const shapes = [
      { shape: "rect", label: "Rectangle", icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/></svg>` },
      { shape: "ellipse", label: "Ellipse", icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="12" rx="10" ry="7"/></svg>` }
    ];
    for (const s of shapes) {
      const btn = document.createElement("button");
      btn.dataset.tracebug = "draw-tool-btn";
      btn.dataset.shape = s.shape;
      btn.title = s.label;
      btn.innerHTML = `${s.icon}<span style="margin-left:4px;font-size:11px">${s.label}</span>`;
      btn.style.cssText = _toolBtnStyle(s.shape === _currentShape);
      btn.addEventListener("click", (e2) => {
        e2.stopPropagation();
        _currentShape = s.shape;
        bar.querySelectorAll("[data-tracebug='draw-tool-btn']").forEach((b) => {
          b.style.cssText = _toolBtnStyle(b.dataset.shape === _currentShape);
        });
      });
      bar.appendChild(btn);
    }
    bar.appendChild(_sep());
    for (const c of COLORS2) {
      const btn = document.createElement("button");
      btn.dataset.tracebug = "draw-color-btn";
      btn.dataset.color = c.value;
      btn.title = c.label;
      btn.style.cssText = `
      width: 22px; height: 22px; border-radius: 50%; cursor: pointer;
      background: ${c.value}; padding: 0; margin: 0; transition: all 0.15s;
      border: 2px solid ${c.value === _currentColor ? "#fff" : "transparent"};
      box-shadow: ${c.value === _currentColor ? "0 0 0 2px rgba(255,255,255,0.3)" : "none"};
    `;
      btn.addEventListener("click", (e2) => {
        e2.stopPropagation();
        _currentColor = c.value;
        bar.querySelectorAll("[data-tracebug='draw-color-btn']").forEach((b) => {
          const isActive = b.dataset.color === _currentColor;
          b.style.borderColor = isActive ? "#fff" : "transparent";
          b.style.boxShadow = isActive ? "0 0 0 2px rgba(255,255,255,0.3)" : "none";
        });
      });
      bar.appendChild(btn);
    }
    const spacer = document.createElement("div");
    spacer.style.flex = "1";
    bar.appendChild(spacer);
    const hint = document.createElement("span");
    hint.style.cssText = "color:rgba(255,255,255,0.5);font-size:11px;margin-right:8px";
    hint.textContent = "Drag to draw. Esc to exit.";
    bar.appendChild(hint);
    const doneBtn = document.createElement("button");
    doneBtn.dataset.tracebug = "draw-done-btn";
    doneBtn.textContent = "Done";
    doneBtn.style.cssText = `
    background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3);
    color: #fff; border-radius: 6px; padding: 6px 16px; cursor: pointer;
    font-size: 12px; font-weight: 500; font-family: inherit; transition: all 0.15s;
  `;
    doneBtn.addEventListener("mouseenter", () => {
      doneBtn.style.background = "rgba(255,255,255,0.25)";
    });
    doneBtn.addEventListener("mouseleave", () => {
      doneBtn.style.background = "rgba(255,255,255,0.15)";
    });
    doneBtn.addEventListener("click", (e2) => {
      e2.stopPropagation();
      deactivateDrawMode();
    });
    bar.appendChild(doneBtn);
    return bar;
  }
  function _sep() {
    const d = document.createElement("div");
    d.dataset.tracebug = "draw-sep";
    d.style.cssText = "width:1px;height:22px;background:rgba(255,255,255,0.2);margin:0 4px;flex-shrink:0";
    return d;
  }
  function _drawShape(ctx, shape, color2, x, y, w, h, fillOpacity) {
    ctx.strokeStyle = color2;
    ctx.lineWidth = 2.5;
    if (shape === "rect") {
      ctx.globalAlpha = fillOpacity;
      ctx.fillStyle = color2;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
      ctx.strokeRect(x, y, w, h);
    } else {
      const cx = x + w / 2;
      const cy = y + h / 2;
      const rx = Math.abs(w) / 2;
      const ry = Math.abs(h) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
      ctx.globalAlpha = fillOpacity;
      ctx.fillStyle = color2;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.stroke();
    }
  }
  function _redrawAllRegions(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    const regions = getDrawRegions();
    const page = window.location.pathname;
    for (let i = 0; i < regions.length; i++) {
      const r = regions[i];
      if (r.page !== page) continue;
      _drawShape(ctx, r.shape, r.color, r.x, r.y, r.width, r.height, 0.12);
      ctx.font = "bold 12px system-ui, -apple-system, sans-serif";
      const label = String(i + 1);
      const metrics = ctx.measureText(label);
      const lx = r.x + 4;
      const ly = r.y + 4;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = r.color;
      const pillW = metrics.width + 12;
      _roundRect(ctx, lx, ly, pillW, 20, 4);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#fff";
      ctx.fillText(label, lx + 6, ly + 14);
      if (r.comment) {
        const cLabel = r.comment.slice(0, 40) + (r.comment.length > 40 ? "..." : "");
        ctx.font = "11px system-ui, -apple-system, sans-serif";
        const cMetrics = ctx.measureText(cLabel);
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = "#000";
        _roundRect(ctx, lx + pillW + 6, ly, cMetrics.width + 12, 20, 4);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#e0e0e0";
        ctx.fillText(cLabel, lx + pillW + 12, ly + 14);
      }
    }
  }
  function _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
  function _showCommentInput(x, y, w, h, root, ctx, canvasW, canvasH) {
    _redrawAllRegions(ctx, canvasW, canvasH);
    ctx.setLineDash([6, 4]);
    _drawShape(ctx, _currentShape, _currentColor, x, y, w, h, 0.15);
    ctx.setLineDash([]);
    let inputTop = y + h + 10;
    const inputLeft = x;
    if (inputTop + 60 > canvasH || inputTop - window.scrollY + 60 > window.innerHeight) {
      inputTop = Math.max(10, y - 60);
    }
    const input = document.createElement("div");
    input.dataset.tracebug = "draw-comment-input";
    input.style.cssText = `
    position: absolute; z-index: 2147483647;
    left: ${inputLeft}px; top: ${inputTop}px;
    background: #1a1a2e; border: 1px solid #3a3a5e; border-radius: 10px;
    padding: 12px; font-family: var(--tb-font-family, system-ui, -apple-system, sans-serif);
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    display: flex; gap: 8px; align-items: center;
    animation: tracebug-draw-slide 0.15s ease;
  `;
    const textInput = document.createElement("input");
    textInput.type = "text";
    textInput.placeholder = "Describe this region (optional)";
    textInput.style.cssText = `
    background: #0f0f1a; border: 1px solid #3a3a5e; color: #e0e0e0;
    padding: 8px 12px; border-radius: 8px; font-size: 13px;
    font-family: inherit; width: 240px; outline: none;
  `;
    const saveBtn = document.createElement("button");
    saveBtn.textContent = "Save";
    saveBtn.dataset.tracebug = "draw-save-btn";
    saveBtn.style.cssText = `
    background: #7B61FF; border: none; color: #fff; padding: 8px 14px;
    border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: 600;
    font-family: inherit; box-shadow: 0 2px 6px rgba(123,97,255,0.3);
    transition: all 0.15s; white-space: nowrap;
  `;
    const skipBtn = document.createElement("button");
    skipBtn.textContent = "No comment";
    skipBtn.dataset.tracebug = "draw-cancel-btn";
    skipBtn.style.cssText = `
    background: none; border: 1px solid #3a3a5e; color: #999;
    padding: 8px 12px; border-radius: 8px; cursor: pointer; font-size: 12px;
    font-family: inherit; transition: all 0.15s; white-space: nowrap;
  `;
    input.appendChild(textInput);
    input.appendChild(saveBtn);
    input.appendChild(skipBtn);
    root.appendChild(input);
    setTimeout(() => textInput.focus(), 50);
    const save = (comment) => {
      const region = {
        id: `dr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
        shape: _currentShape,
        x,
        y,
        width: w,
        height: h,
        comment,
        color: _currentColor,
        page: window.location.pathname,
        scrollX: window.scrollX,
        scrollY: window.scrollY
      };
      addDrawRegion(region);
      input.remove();
      _redrawAllRegions(ctx, canvasW, canvasH);
      if (_onUpdate2) _onUpdate2();
    };
    saveBtn.addEventListener("click", (e2) => {
      e2.stopPropagation();
      save(textInput.value.trim());
    });
    skipBtn.addEventListener("click", (e2) => {
      e2.stopPropagation();
      save("");
    });
    textInput.addEventListener("keydown", (e2) => {
      e2.stopPropagation();
      if (e2.key === "Enter") save(textInput.value.trim());
      if (e2.key === "Escape") {
        input.remove();
        _redrawAllRegions(ctx, canvasW, canvasH);
      }
    });
  }
  function _toolBtnStyle(active) {
    if (active) {
      return `background:rgba(255,255,255,0.2);color:#fff;border:1px solid rgba(255,255,255,0.4);border-radius:var(--tb-radius-md, 8px);padding:5px 12px;cursor:pointer;font-size:12px;font-family:inherit;display:flex;align-items:center;transition:all 0.15s;`;
    }
    return `background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.6);border:1px solid rgba(255,255,255,0.15);border-radius:var(--tb-radius-md, 8px);padding:5px 12px;cursor:pointer;font-size:12px;font-family:inherit;display:flex;align-items:center;transition:all 0.15s;`;
  }

  // src/compact-toolbar.ts
  init_screenshot();
  init_voice_recorder();
  init_collectors();
  init_screenshot();

  // src/region-screenshot.ts
  init_screenshot();
  function captureRegionScreenshot() {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.dataset.tracebug = "region-overlay";
      Object.assign(overlay.style, {
        position: "fixed",
        inset: "0",
        zIndex: "2147483647",
        background: "rgba(0,0,0,0.35)",
        cursor: "crosshair",
        userSelect: "none"
      });
      const sel = document.createElement("div");
      sel.dataset.tracebug = "region-overlay";
      Object.assign(sel.style, {
        position: "absolute",
        border: "2px dashed #7B61FF",
        background: "rgba(123,97,255,0.15)",
        display: "none",
        pointerEvents: "none"
      });
      overlay.appendChild(sel);
      const hint = document.createElement("div");
      hint.dataset.tracebug = "region-overlay";
      hint.textContent = "Drag to select an area \xB7 Esc to cancel";
      Object.assign(hint.style, {
        position: "absolute",
        top: "16px",
        left: "50%",
        transform: "translateX(-50%)",
        padding: "8px 14px",
        borderRadius: "8px",
        background: "rgba(20,20,30,0.85)",
        color: "#fff",
        font: "13px/1.4 system-ui, -apple-system, sans-serif",
        pointerEvents: "none"
      });
      overlay.appendChild(hint);
      document.body.appendChild(overlay);
      let sx = 0, sy = 0, dragging = false;
      const onDown = (e2) => {
        dragging = true;
        sx = e2.clientX;
        sy = e2.clientY;
        sel.style.left = `${sx}px`;
        sel.style.top = `${sy}px`;
        sel.style.width = "0px";
        sel.style.height = "0px";
        sel.style.display = "block";
      };
      const onMove = (e2) => {
        if (!dragging) return;
        const x = Math.min(sx, e2.clientX), y = Math.min(sy, e2.clientY);
        const w = Math.abs(e2.clientX - sx), h = Math.abs(e2.clientY - sy);
        Object.assign(sel.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
      };
      const cleanup = () => {
        overlay.removeEventListener("mousedown", onDown);
        overlay.removeEventListener("mousemove", onMove);
        overlay.removeEventListener("mouseup", onUp);
        document.removeEventListener("keydown", onKey, true);
        overlay.remove();
      };
      const onKey = (e2) => {
        if (e2.key === "Escape") {
          e2.stopPropagation();
          cleanup();
          resolve(null);
        }
      };
      const onUp = async (e2) => {
        if (!dragging) return;
        dragging = false;
        const rect = {
          x: Math.min(sx, e2.clientX),
          y: Math.min(sy, e2.clientY),
          w: Math.abs(e2.clientX - sx),
          h: Math.abs(e2.clientY - sy)
        };
        cleanup();
        if (rect.w < 5 || rect.h < 5) {
          resolve(null);
          return;
        }
        try {
          const full = await captureScreenshot(null);
          const cropped = await cropDataUrl(full.dataUrl, rect);
          resolve({
            ...full,
            dataUrl: cropped,
            width: rect.w,
            height: rect.h,
            filename: full.filename.replace(/\.png$/, "_region.png")
          });
        } catch (err) {
          console.warn("[TraceBug] Region screenshot failed:", err);
          resolve(null);
        }
      };
      overlay.addEventListener("mousedown", onDown);
      overlay.addEventListener("mousemove", onMove);
      overlay.addEventListener("mouseup", onUp);
      document.addEventListener("keydown", onKey, true);
    });
  }
  function cropDataUrl(dataUrl, r) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const sx = img.naturalWidth / window.innerWidth;
        const sy = img.naturalHeight / window.innerHeight;
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(r.w * sx));
        c.height = Math.max(1, Math.round(r.h * sy));
        const ctx = c.getContext("2d");
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, r.x * sx, r.y * sy, r.w * sx, r.h * sy, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/png", 0.9));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  // src/compact-toolbar.ts
  init_plan();
  init_upgrade_modal();
  init_storage();

  // src/onboarding.ts
  var STORAGE_KEY2 = "tracebug_onboarding_complete";
  var TOOLTIP_ID = "tracebug-onboarding-tooltip";
  var STEPS = [
    {
      targetId: "tracebug-toolbar-panel-btn",
      text: "TraceBug is recording \u2014 find bugs, we\u2019ll write the report",
      icon: "\u{1F44B}"
    },
    {
      targetId: "tracebug-toolbar-screenshot-btn",
      text: "Screenshot anything suspicious",
      icon: "\u{1F4F7}"
    },
    {
      targetId: "tracebug-toolbar-annotate-btn",
      text: "Click elements to annotate feedback",
      icon: "\u{1F3AF}"
    },
    {
      targetId: "tracebug-toolbar-panel-btn",
      text: "Open here to see sessions & export reports",
      icon: "\u{1F4CB}"
    }
  ];
  var _currentStep = 0;
  var _cleanup3 = null;
  function isComplete() {
    try {
      return localStorage.getItem(STORAGE_KEY2) === "true";
    } catch (e2) {
      return false;
    }
  }
  function markComplete() {
    try {
      localStorage.setItem(STORAGE_KEY2, "true");
    } catch (e2) {
    }
  }
  function startOnboarding(root) {
    if (isComplete()) return;
    setTimeout(() => {
      _currentStep = 0;
      _showStep(root);
    }, 800);
  }
  function replayOnboarding(root) {
    _removeTooltip();
    _currentStep = 0;
    _showStep(root);
  }
  function addLogoPulse() {
    if (isComplete()) return;
    const logo = document.getElementById("tracebug-toolbar-panel-btn");
    if (!logo) return;
    logo.style.animation = "tracebug-onboard-pulse 1.5s ease-in-out 6";
    setTimeout(() => {
      if (logo) logo.style.animation = "";
    }, 1e4);
  }
  function cleanupOnboarding() {
    _removeTooltip();
    if (_cleanup3) {
      _cleanup3();
      _cleanup3 = null;
    }
  }
  function _showStep(root) {
    _removeTooltip();
    if (_currentStep >= STEPS.length) {
      markComplete();
      return;
    }
    const step = STEPS[_currentStep];
    const target = document.getElementById(step.targetId);
    if (!target) {
      _currentStep++;
      _showStep(root);
      return;
    }
    const tooltip = document.createElement("div");
    tooltip.id = TOOLTIP_ID;
    tooltip.dataset.tracebug = "onboarding-tooltip";
    const rect = target.getBoundingClientRect();
    tooltip.style.cssText = `
    position: fixed; z-index: 2147483647;
    right: ${window.innerWidth - rect.left + 12}px;
    top: ${rect.top + rect.height / 2 - 24}px;
    background: var(--tb-bg-secondary, #1a1a2e);
    border: 1px solid var(--tb-accent, #7B61FF);
    border-radius: var(--tb-radius-lg, 12px);
    padding: 12px 16px;
    max-width: 260px;
    font-family: var(--tb-font-family, system-ui, -apple-system, sans-serif);
    font-size: 13px;
    color: var(--tb-text-primary, #e0e0e0);
    box-shadow: 0 4px 24px rgba(123, 97, 255, 0.25);
    animation: tracebug-tooltip-in 0.2s ease;
    pointer-events: auto;
  `;
    const arrow = `
    <div style="
      position: absolute; right: -6px; top: 18px;
      width: 10px; height: 10px;
      background: var(--tb-bg-secondary, #1a1a2e);
      border-right: 1px solid var(--tb-accent, #7B61FF);
      border-top: 1px solid var(--tb-accent, #7B61FF);
      transform: rotate(45deg);
    "></div>
  `;
    const stepNum = `<span style="color:var(--tb-text-muted, #666);font-size:11px">${_currentStep + 1}/${STEPS.length}</span>`;
    const isLast = _currentStep === STEPS.length - 1;
    tooltip.innerHTML = `
    ${arrow}
    <div style="display:flex;align-items:flex-start;gap:10px">
      <span style="font-size:20px;flex-shrink:0;line-height:1.2">${step.icon}</span>
      <div>
        <div style="margin-bottom:8px;line-height:1.4">${step.text}</div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          ${stepNum}
          <div style="display:flex;gap:6px">
            <button data-action="skip" style="
              background:transparent;border:none;color:var(--tb-text-muted, #888);
              cursor:pointer;font-size:11px;padding:4px 8px;font-family:inherit
            ">Skip</button>
            <button data-action="next" style="
              background:var(--tb-accent, #7B61FF);border:none;color:#fff;
              border-radius:var(--tb-radius-sm, 4px);cursor:pointer;font-size:11px;
              padding:4px 12px;font-family:inherit;font-weight:600
            ">${isLast ? "Done" : "Next"}</button>
          </div>
        </div>
      </div>
    </div>
  `;
    root.appendChild(tooltip);
    target.style.boxShadow = "0 0 0 2px var(--tb-accent, #7B61FF), 0 0 12px rgba(123,97,255,0.4)";
    target.style.borderRadius = "var(--tb-radius-md, 8px)";
    tooltip.querySelector('[data-action="next"]').addEventListener("click", () => {
      target.style.boxShadow = "";
      _currentStep++;
      _showStep(root);
    });
    tooltip.querySelector('[data-action="skip"]').addEventListener("click", () => {
      target.style.boxShadow = "";
      _removeTooltip();
      markComplete();
    });
  }
  function _removeTooltip() {
    const el = document.getElementById(TOOLTIP_ID);
    if (el) el.remove();
    STEPS.forEach((s) => {
      const btn = document.getElementById(s.targetId);
      if (btn) btn.style.boxShadow = "";
    });
  }
  function injectOnboardingStyles() {
    if (document.getElementById("tracebug-onboarding-styles")) return;
    const style = document.createElement("style");
    style.id = "tracebug-onboarding-styles";
    style.textContent = `
    @keyframes tracebug-tooltip-in {
      from { opacity: 0; transform: translateX(8px); }
      to { opacity: 1; transform: translateX(0); }
    }
    @keyframes tracebug-onboard-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(123, 97, 255, 0); }
      50% { box-shadow: 0 0 0 4px rgba(123, 97, 255, 0.4); }
    }
  `;
    document.head.appendChild(style);
  }

  // src/compact-toolbar.ts
  init_quick_bug();
  init_helpers();
  init_video_recorder();

  // src/ui/recording-hud.ts
  init_video_recorder();
  var HUD_ID = "tracebug-recording-hud";
  var _root = null;
  var _hud = null;
  var _timerInterval = null;
  var _onStopRequested = null;
  var _onCommentSaved = null;
  function _formatElapsed(ms) {
    const total = Math.max(0, Math.floor(ms / 1e3));
    const m = Math.floor(total / 60).toString().padStart(2, "0");
    const s = (total % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }
  function showRecordingHUD(root, options) {
    if (_hud) return;
    if (!isVideoRecording()) return;
    _root = root;
    _onStopRequested = options.onStop;
    _onCommentSaved = options.onCommentSaved || null;
    const hud = document.createElement("div");
    hud.id = HUD_ID;
    hud.dataset.tracebug = "recording-hud";
    hud.setAttribute("role", "status");
    hud.setAttribute("aria-live", "polite");
    hud.style.cssText = `
    position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
    background: var(--tb-bg-secondary, #1a1a2e);
    border: 1px solid var(--tb-error, #ef4444);
    border-radius: 999px;
    padding: 8px 8px 8px 14px;
    display: flex; align-items: center; gap: 10px;
    color: var(--tb-text-primary, #e0e0e0);
    font-family: var(--tb-font-family, system-ui, -apple-system, sans-serif);
    font-size: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    z-index: 2147483647;
    pointer-events: auto;
    animation: tracebug-hud-in 0.2s ease;
  `;
    if (!document.getElementById("tracebug-hud-anim")) {
      const style = document.createElement("style");
      style.id = "tracebug-hud-anim";
      style.textContent = `
      @keyframes tracebug-hud-in { from { opacity:0; transform:translate(-50%, -8px); } to { opacity:1; transform:translate(-50%, 0); } }
      @keyframes tracebug-hud-pulse { 0%,100% { opacity:1; } 50% { opacity:0.35; } }
    `;
      document.head.appendChild(style);
    }
    hud.innerHTML = `
    <span data-tb-hud="dot" style="width:8px;height:8px;border-radius:50%;background:var(--tb-error, #ef4444);animation:tracebug-hud-pulse 1.2s infinite;flex-shrink:0"></span>
    <span data-tb-hud="timer" style="font-variant-numeric:tabular-nums;font-weight:600;min-width:38px">00:00</span>
    <span style="width:1px;height:14px;background:var(--tb-border, #2a2a3e);margin:0 2px"></span>
    <input
      data-tb-hud="comment"
      type="text"
      placeholder="Add comment at this moment..."
      maxlength="240"
      aria-label="Add a timestamped comment"
      style="background:transparent;border:none;outline:none;color:var(--tb-text-primary, #e0e0e0);font-size:12px;font-family:inherit;width:220px;padding:4px 6px"
    />
    <button
      data-tb-hud="add"
      title="Save comment (Enter)"
      aria-label="Save comment"
      style="background:var(--tb-accent, #7B61FF);color:#fff;border:none;border-radius:999px;width:26px;height:26px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;padding:0"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
    </button>
    <button
      data-tb-hud="stop"
      title="Stop recording"
      aria-label="Stop recording"
      style="background:var(--tb-error, #ef4444);color:#fff;border:none;border-radius:999px;padding:6px 12px;cursor:pointer;font-size:11px;font-weight:700;font-family:inherit;flex-shrink:0;display:flex;align-items:center;gap:5px"
    >
      <span style="width:8px;height:8px;background:#fff;border-radius:1px;display:inline-block"></span>
      Stop
    </button>
  `;
    root.appendChild(hud);
    _hud = hud;
    const timerEl = hud.querySelector('[data-tb-hud="timer"]');
    const commentInput = hud.querySelector('[data-tb-hud="comment"]');
    const addBtn = hud.querySelector('[data-tb-hud="add"]');
    const stopBtn = hud.querySelector('[data-tb-hud="stop"]');
    _timerInterval = setInterval(() => {
      if (!isVideoRecording()) return;
      timerEl.textContent = _formatElapsed(getVideoElapsedMs());
    }, 500);
    const saveComment = () => {
      const text = commentInput.value.trim();
      if (!text) return;
      const c = addVideoComment(text);
      if (c) {
        _onCommentSaved == null ? void 0 : _onCommentSaved(c.text, c.offsetMs);
        commentInput.value = "";
        commentInput.style.transition = "background 0.3s";
        commentInput.style.background = "var(--tb-success, #22c55e)33";
        setTimeout(() => {
          commentInput.style.background = "transparent";
        }, 400);
      }
    };
    addBtn.addEventListener("click", saveComment);
    commentInput.addEventListener("keydown", (e2) => {
      if (e2.key === "Enter") {
        e2.preventDefault();
        saveComment();
      }
    });
    stopBtn.addEventListener("click", () => {
      _onStopRequested == null ? void 0 : _onStopRequested();
    });
  }
  function hideRecordingHUD() {
    if (_timerInterval) {
      clearInterval(_timerInterval);
      _timerInterval = null;
    }
    _hud == null ? void 0 : _hud.remove();
    _hud = null;
    _root = null;
    _onStopRequested = null;
    _onCommentSaved = null;
  }

  // src/compact-toolbar.ts
  var TOOLBAR_ID = "tracebug-compact-toolbar";
  var SETTINGS_ID = "tracebug-settings-card";
  var DRAG_POS_KEY = "tracebug_toolbar_pos";
  var _isRecording = true;
  var _onToggleRecording = null;
  var _renderPanel = null;
  var _panelEl = null;
  var _panelOpen = false;
  var _annotationViewOpen = false;
  var _toolbar = null;
  var _position = "right";
  var _isMobile = false;
  var _fabExpanded = false;
  function setToolbarRecordingState(isRecording2, onToggle) {
    _isRecording = isRecording2;
    _onToggleRecording = onToggle;
  }
  function updateToolbarRecordingState(isRecording2) {
    _isRecording = isRecording2;
    const dot = document.getElementById("tracebug-toolbar-rec-dot");
    if (dot) {
      dot.style.background = isRecording2 ? "var(--tb-success, #22c55e)" : "var(--tb-error, #ef4444)";
      dot.style.animation = isRecording2 ? "bt-pulse 2s infinite" : "none";
    }
  }
  function setRenderPanel(fn) {
    _renderPanel = fn;
  }
  function mountCompactToolbar(root, panel, showToast3, renderAnnotationList2, position2 = "right", shortcuts) {
    _panelEl = panel;
    _position = position2;
    _isMobile = window.innerWidth < 768;
    const toolbar = document.createElement("div");
    toolbar.id = TOOLBAR_ID;
    toolbar.dataset.tracebug = "compact-toolbar";
    _toolbar = toolbar;
    _applyToolbarPosition(toolbar, position2);
    _initDrag(toolbar);
    toolbar.appendChild(_createToolbarBtn(
      "TraceBug Dashboard",
      _logoSvg(),
      () => _togglePanel(panel, toolbar, showToast3),
      "tracebug-toolbar-panel-btn"
    ));
    const recDot = document.createElement("div");
    recDot.id = "tracebug-toolbar-rec-dot";
    recDot.dataset.tracebug = "rec-dot";
    recDot.style.cssText = `
    width: 6px; height: 6px; border-radius: 50%; margin: -1px 0 2px 0;
    background: ${_isRecording ? "var(--tb-success, #22c55e)" : "var(--tb-error, #ef4444)"};
    animation: ${_isRecording ? "bt-pulse 2s infinite" : "none"};
  `;
    toolbar.appendChild(recDot);
    toolbar.appendChild(_divider());
    const quickBugBtn = _createToolbarBtn(
      "Quick Bug Capture (Ctrl+Shift+B)",
      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
      () => {
        if (!isQuickBugOpen()) {
          showQuickBugCapture(root).catch(() => showToast3("Quick capture failed", root));
        }
      },
      "tracebug-toolbar-quickbug-btn"
    );
    quickBugBtn.style.color = "var(--tb-accent, #7B61FF)";
    quickBugBtn.addEventListener("mouseenter", () => {
      quickBugBtn.style.background = "var(--tb-accent-subtle, #7B61FF33)";
      quickBugBtn.style.color = "var(--tb-accent, #7B61FF)";
    });
    quickBugBtn.addEventListener("mouseleave", () => {
      quickBugBtn.style.background = "transparent";
      quickBugBtn.style.color = "var(--tb-accent, #7B61FF)";
    });
    toolbar.appendChild(quickBugBtn);
    toolbar.appendChild(_divider());
    const annotateBtn = _createToolbarBtn(
      "Annotate Elements (Ctrl+Shift+A)",
      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>`,
      () => {
        if (isElementAnnotateActive()) {
          deactivateElementAnnotateMode();
          _updateActiveStates(toolbar);
        } else {
          if (isDrawModeActive()) deactivateDrawMode();
          activateElementAnnotateMode(root, () => {
            _updateAnnotationCount(toolbar);
            showToast3("Annotation saved", root);
          }, () => {
            _updateActiveStates(toolbar);
          });
          _updateActiveStates(toolbar);
        }
      },
      "tracebug-toolbar-annotate-btn"
    );
    toolbar.appendChild(annotateBtn);
    const drawBtn = _createToolbarBtn(
      "Draw Regions (Ctrl+Shift+D)",
      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/></svg>`,
      () => {
        if (isDrawModeActive()) {
          deactivateDrawMode();
          _updateActiveStates(toolbar);
        } else {
          if (isElementAnnotateActive()) deactivateElementAnnotateMode();
          activateDrawMode(root, () => {
            _updateAnnotationCount(toolbar);
            showToast3("Region saved", root);
          }, () => {
            _updateActiveStates(toolbar);
          });
          _updateActiveStates(toolbar);
        }
      },
      "tracebug-toolbar-draw-btn"
    );
    toolbar.appendChild(drawBtn);
    const _checkLimit = () => {
      if (isPremium()) return true;
      if (getScreenshots().length < FREE_LIMITS.screenshots) return true;
      showUpgradeModal({
        feature: "Unlimited screenshots",
        message: `Free plan is capped at ${FREE_LIMITS.screenshots} screenshots per ticket. Upgrade for unlimited captures.`
      }, root);
      return false;
    };
    toolbar.appendChild(_createToolbarBtn(
      "Screenshot (Ctrl+Shift+S) \u2014 added to ticket",
      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="12" cy="12" r="3"/></svg>`,
      async () => {
        var _a;
        if (!_checkLimit()) return;
        showToast3("Capturing...", root);
        try {
          const sessions = getAllSessions().sort((a2, b) => b.updatedAt - a2.updatedAt);
          const lastEvent = ((_a = sessions[0]) == null ? void 0 : _a.events[sessions[0].events.length - 1]) || null;
          await captureScreenshot(lastEvent);
          const n = getScreenshots().length;
          const cap = isPremium() ? "" : ` / ${FREE_LIMITS.screenshots}`;
          showToast3(`Added to ticket \xB7 ${n}${cap} screenshot${n === 1 ? "" : "s"}`, root);
        } catch (e2) {
          showToast3("Screenshot failed", root);
        }
      },
      "tracebug-toolbar-screenshot-btn"
    ));
    toolbar.appendChild(_createToolbarBtn(
      "Region Screenshot \u2014 drag to select, added to ticket",
      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8V5a1 1 0 0 1 1-1h3"/><path d="M16 4h3a1 1 0 0 1 1 1v3"/><path d="M20 16v3a1 1 0 0 1-1 1h-3"/><path d="M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M9 9h6v6H9z"/></svg>`,
      async () => {
        if (!_checkLimit()) return;
        try {
          const ss = await captureRegionScreenshot();
          if (!ss) {
            showToast3("Cancelled", root);
            return;
          }
          const n = getScreenshots().length;
          const cap = isPremium() ? "" : ` / ${FREE_LIMITS.screenshots}`;
          showToast3(`Region added to ticket \xB7 ${n}${cap} screenshot${n === 1 ? "" : "s"}`, root);
        } catch (e2) {
          showToast3("Region screenshot failed", root);
        }
      },
      "tracebug-toolbar-region-btn"
    ));
    const recordBtn = _createToolbarBtn(
      "Record screen + steps",
      _recordIconSvg(false),
      () => _toggleVideoRecording(root, recordBtn, showToast3),
      "tracebug-toolbar-record-btn"
    );
    if (!isVideoSupported()) {
      recordBtn.style.opacity = "0.4";
      recordBtn.style.cursor = "not-allowed";
      recordBtn.title = "Screen recording not supported in this browser";
    }
    toolbar.appendChild(recordBtn);
    toolbar.appendChild(_divider());
    const listBtn = _createToolbarBtn(
      "Annotation List",
      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>`,
      () => {
        if (_annotationViewOpen && _panelOpen) {
          _togglePanel(panel, toolbar, showToast3);
          _annotationViewOpen = false;
        } else {
          if (!_panelOpen) _togglePanel(panel, toolbar, showToast3);
          renderAnnotationList2(panel);
          _annotationViewOpen = true;
        }
      },
      "tracebug-toolbar-list-btn"
    );
    const badge = document.createElement("div");
    badge.id = "tracebug-toolbar-badge";
    badge.dataset.tracebug = "toolbar-badge";
    badge.style.cssText = `
    position: absolute; top: -2px; right: -2px;
    min-width: 14px; height: 14px; border-radius: 7px;
    background: var(--tb-accent, #7B61FF); color: #fff; font-size: 9px; font-weight: 700;
    font-family: var(--tb-font-family, system-ui, sans-serif);
    display: flex; align-items: center; justify-content: center;
    padding: 0 3px; line-height: 1;
  `;
    const count = getAnnotationCount();
    badge.textContent = String(count);
    badge.style.display = count > 0 ? "flex" : "none";
    listBtn.style.position = "relative";
    listBtn.appendChild(badge);
    toolbar.appendChild(listBtn);
    toolbar.appendChild(_divider());
    toolbar.appendChild(_createToolbarBtn(
      "Settings",
      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
      (e2) => _toggleSettingsCard(e2, root, toolbar, showToast3),
      "tracebug-toolbar-settings-btn"
    ));
    toolbar.appendChild(_createToolbarBtn(
      "Help \u2014 replay tour",
      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
      () => replayOnboarding(root),
      "tracebug-toolbar-help-btn"
    ));
    root.appendChild(toolbar);
    if (_isMobile) {
      _convertToFab(toolbar, root, panel, showToast3);
    }
    const resizeHandler = () => {
      const wasMobile = _isMobile;
      _isMobile = window.innerWidth < 768;
      if (wasMobile !== _isMobile) {
        if (_isMobile) {
          _convertToFab(toolbar, root, panel, showToast3);
        } else {
          _restoreToolbar(toolbar);
        }
      }
    };
    window.addEventListener("resize", resizeHandler);
    const annotateShortcut = (shortcuts == null ? void 0 : shortcuts.annotate) || "ctrl+shift+a";
    const drawShortcut = (shortcuts == null ? void 0 : shortcuts.draw) || "ctrl+shift+d";
    const keyHandler = (e2) => {
      var _a, _b;
      if (matchesShortcut(e2, annotateShortcut)) {
        e2.preventDefault();
        (_a = toolbar.querySelector("#tracebug-toolbar-annotate-btn")) == null ? void 0 : _a.click();
      }
      if (matchesShortcut(e2, drawShortcut)) {
        e2.preventDefault();
        (_b = toolbar.querySelector("#tracebug-toolbar-draw-btn")) == null ? void 0 : _b.click();
      }
    };
    document.addEventListener("keydown", keyHandler);
    return () => {
      toolbar.remove();
      document.removeEventListener("keydown", keyHandler);
      window.removeEventListener("resize", resizeHandler);
      deactivateElementAnnotateMode();
      deactivateDrawMode();
      const settingsCard = document.getElementById(SETTINGS_ID);
      settingsCard == null ? void 0 : settingsCard.remove();
      _toolbar = null;
    };
  }
  function _createToolbarBtn(title, iconHtml, onClick, id) {
    const btn = document.createElement("button");
    if (id) btn.id = id;
    btn.dataset.tracebug = "toolbar-btn";
    btn.title = title;
    btn.setAttribute("aria-label", title);
    btn.innerHTML = iconHtml;
    btn.style.cssText = `
    width: 34px; height: 34px; border-radius: var(--tb-radius-md, 8px); border: none;
    background: transparent; color: var(--tb-btn-text, #aaa); cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    padding: 0; transition: all 0.15s;
  `;
    btn.addEventListener("mouseenter", () => {
      if (!btn.classList.contains("tb-active")) {
        btn.style.background = "var(--tb-btn-hover, #ffffff15)";
        btn.style.color = "var(--tb-btn-text-hover, #fff)";
      }
    });
    btn.addEventListener("mouseleave", () => {
      if (!btn.classList.contains("tb-active")) {
        btn.style.background = "transparent";
        btn.style.color = "var(--tb-btn-text, #aaa)";
      }
    });
    btn.addEventListener("click", onClick);
    return btn;
  }
  function _divider() {
    const d = document.createElement("div");
    d.dataset.tracebug = "toolbar-divider";
    d.style.cssText = "width:20px;height:1px;background:var(--tb-border, #2a2a3e);margin:2px 0";
    return d;
  }
  function _recordIconSvg(active) {
    const fill = active ? "var(--tb-error, #ef4444)" : "currentColor";
    return active ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="${fill}" stroke="${fill}" stroke-width="1.5"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>` : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4" fill="currentColor"/></svg>`;
  }
  async function _toggleVideoRecording(root, btn, showToast3) {
    if (!isVideoSupported()) {
      showToast3("Screen recording not supported in this browser", root);
      return;
    }
    if (isVideoRecording()) {
      showToast3("Stopping recording...", root);
      await stopVideoRecording();
      hideRecordingHUD();
      btn.innerHTML = _recordIconSvg(false);
      btn.classList.remove("tb-active");
      btn.style.color = "var(--tb-btn-text, #aaa)";
      try {
        if (!isQuickBugOpen()) await showQuickBugCapture(root);
      } catch (err) {
        console.warn("[TraceBug] Failed to open ticket review after recording:", err);
      }
      return;
    }
    showToast3("Pick a screen, window, or tab to record", root);
    const ok = await startVideoRecording({
      onStatus: (status, message) => {
        if (status === "error" && message) showToast3(`Recording error: ${message}`, root);
      }
    });
    if (!ok) {
      showToast3("Recording cancelled", root);
      return;
    }
    btn.innerHTML = _recordIconSvg(true);
    btn.classList.add("tb-active");
    btn.style.color = "var(--tb-error, #ef4444)";
    showRecordingHUD(root, {
      onStop: () => {
        _toggleVideoRecording(root, btn, showToast3).catch(() => {
        });
      }
    });
    showToast3("Recording started \u2014 comments are timestamped", root);
  }
  function _togglePanel(panel, toolbar, showToast3) {
    _panelOpen = !_panelOpen;
    if (_isMobile) {
      panel.style.bottom = _panelOpen ? "0" : "-85vh";
    } else {
      const isLeft = _position === "left" || _position === "bottom-left";
      if (isLeft) {
        panel.style.left = _panelOpen ? "0" : "-480px";
        panel.style.right = "auto";
        if (!localStorage.getItem(DRAG_POS_KEY)) {
          toolbar.style.left = _panelOpen ? "482px" : "12px";
        }
      } else {
        panel.style.right = _panelOpen ? "0" : "-480px";
        if (!localStorage.getItem(DRAG_POS_KEY)) {
          toolbar.style.right = _panelOpen ? "482px" : "12px";
        }
      }
    }
    if (_panelOpen && _renderPanel) {
      _annotationViewOpen = false;
      _renderPanel(panel);
    }
  }
  function _updateActiveStates(toolbar) {
    const annotateBtn = toolbar.querySelector("#tracebug-toolbar-annotate-btn");
    const drawBtn = toolbar.querySelector("#tracebug-toolbar-draw-btn");
    if (annotateBtn) {
      const active = isElementAnnotateActive();
      annotateBtn.classList.toggle("tb-active", active);
      annotateBtn.style.background = active ? "var(--tb-accent-subtle, #7B61FF33)" : "transparent";
      annotateBtn.style.color = active ? "var(--tb-accent, #7B61FF)" : "var(--tb-text-muted, #888)";
    }
    if (drawBtn) {
      const active = isDrawModeActive();
      drawBtn.classList.toggle("tb-active", active);
      drawBtn.style.background = active ? "var(--tb-accent-subtle, #7B61FF33)" : "transparent";
      drawBtn.style.color = active ? "var(--tb-accent, #7B61FF)" : "var(--tb-text-muted, #888)";
    }
  }
  function _updateAnnotationCount(toolbar) {
    const badge = toolbar.querySelector("#tracebug-toolbar-badge");
    if (badge) {
      const count = getAnnotationCount();
      badge.textContent = String(count);
      badge.style.display = count > 0 ? "flex" : "none";
    }
  }
  function _toggleSettingsCard(e2, root, toolbar, showToast3) {
    e2.stopPropagation();
    const existing = document.getElementById(SETTINGS_ID);
    if (existing) {
      existing.remove();
      return;
    }
    const card = document.createElement("div");
    card.id = SETTINGS_ID;
    card.dataset.tracebug = "settings-card";
    const toolbarRect = toolbar.getBoundingClientRect();
    card.style.cssText = `
    position: fixed; z-index: 2147483647;
    right: ${window.innerWidth - toolbarRect.left + 8}px;
    top: ${toolbarRect.top + toolbarRect.height - 220}px;
    width: 220px; background: var(--tb-bg-secondary, #1a1a2e); border: 1px solid var(--tb-border-hover, #3a3a5e);
    border-radius: var(--tb-radius-lg, 12px); padding: 16px;
    font-family: var(--tb-font-family, system-ui, sans-serif); font-size: 13px; color: var(--tb-text-primary, #e0e0e0);
    box-shadow: var(--tb-shadow-lg, 0 8px 32px rgba(0,0,0,0.5));
  `;
    const sessions = getAllSessions();
    const errorCount = sessions.filter((s) => s.errorMessage).length;
    card.innerHTML = `
    <div style="font-size:14px;font-weight:600;margin-bottom:12px;display:flex;align-items:center;gap:8px">
      Settings
    </div>
    <div style="display:flex;flex-direction:column;gap:10px">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:12px;color:var(--tb-text-secondary, #aaa)">Recording</span>
        <button id="tracebug-settings-rec" style="
          background:${_isRecording ? "var(--tb-success-bg, #22c55e22)" : "var(--tb-error-bg, #ef444422)"};
          color:${_isRecording ? "var(--tb-success, #22c55e)" : "var(--tb-error, #ef4444)"};
          border:1px solid ${_isRecording ? "var(--tb-success, #22c55e)44" : "var(--tb-error, #ef4444)44"};
          border-radius:6px;padding:3px 10px;cursor:pointer;font-size:11px;font-family:inherit
        ">${_isRecording ? "Pause" : "Resume"}</button>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:12px;color:var(--tb-text-secondary, #aaa)">Sessions</span>
        <span style="font-size:12px;color:var(--tb-text-muted, #888)">${sessions.length} (${errorCount} errors)</span>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:12px;color:var(--tb-text-secondary, #aaa)">Annotations</span>
        <span style="font-size:12px;color:var(--tb-text-muted, #888)">${getAnnotationCount()}</span>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:12px;color:var(--tb-text-secondary, #aaa)">Screenshots</span>
        <span style="font-size:12px;color:var(--tb-text-muted, #888)">${getScreenshots().length}${isPremium() ? "" : ` / ${FREE_LIMITS.screenshots}`}</span>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:12px;color:var(--tb-text-secondary, #aaa)">Plan</span>
        <span id="tracebug-settings-plan-badge" style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;${isPremium() ? "background:var(--tb-accent, #7B61FF);color:#fff" : "background:var(--tb-border, #2a2a3e);color:var(--tb-text-secondary, #aaa)"}">${isPremium() ? "\u2728 Premium" : "Free Plan"}</span>
      </div>
      <div style="border-top:1px solid var(--tb-border, #2a2a3e);padding-top:10px;display:flex;gap:6px">
        <button id="tracebug-settings-clear-ann" style="flex:1;background:var(--tb-warning-bg, #f9731622);color:var(--tb-warning, #f97316);border:1px solid var(--tb-warning, #f97316)44;border-radius:6px;padding:4px;cursor:pointer;font-size:10px;font-family:inherit">Clear Annotations</button>
        <button id="tracebug-settings-clear-all" style="flex:1;background:var(--tb-error-bg, #ef444422);color:var(--tb-error, #ef4444);border:1px solid var(--tb-error, #ef4444)44;border-radius:6px;padding:4px;cursor:pointer;font-size:10px;font-family:inherit">Clear All Data</button>
      </div>
    </div>
  `;
    root.appendChild(card);
    card.querySelector("#tracebug-settings-rec").addEventListener("click", () => {
      if (_onToggleRecording) _onToggleRecording();
      card.remove();
    });
    const planBadge = card.querySelector("#tracebug-settings-plan-badge");
    if (planBadge) {
      planBadge.style.cursor = "pointer";
      planBadge.title = "View plan / upgrade";
      planBadge.addEventListener("click", () => {
        card.remove();
        showUpgradeModal({
          feature: isPremium() ? "Premium plan" : "Premium plan",
          message: isPremium() ? "You're on Premium. Use the dev toggle below to switch back to Free for testing." : "Unlock unlimited screenshots, PDF export, Jira tickets, advanced metadata, and custom branding."
        }, root);
      });
    }
    card.querySelector("#tracebug-settings-clear-ann").addEventListener("click", () => {
      clearAllAnnotations();
      _updateAnnotationCount(toolbar);
      showToast3("Annotations cleared", root);
      card.remove();
    });
    card.querySelector("#tracebug-settings-clear-all").addEventListener("click", () => {
      if (confirm("Delete all TraceBug data? This clears sessions, screenshots, voice notes, annotations, and the network failure buffer.")) {
        try {
          clearAllSessions();
        } catch (e3) {
        }
        try {
          clearScreenshots();
        } catch (e3) {
        }
        try {
          clearVoiceTranscripts();
        } catch (e3) {
        }
        try {
          clearAllAnnotations();
        } catch (e3) {
        }
        try {
          clearAnnotationBadges();
        } catch (e3) {
        }
        try {
          clearNetworkFailures();
        } catch (e3) {
        }
        _updateAnnotationCount(toolbar);
        showToast3("All data cleared", root);
        card.remove();
      }
    });
    const closeHandler = (ev) => {
      if (!card.contains(ev.target) && ev.target !== e2.target) {
        card.remove();
        document.removeEventListener("click", closeHandler);
      }
    };
    setTimeout(() => document.addEventListener("click", closeHandler), 10);
  }
  function _applyToolbarPosition(toolbar, position2) {
    let savedPos = null;
    try {
      const raw = localStorage.getItem(DRAG_POS_KEY);
      if (raw) savedPos = JSON.parse(raw);
    } catch (e2) {
    }
    const isBottom = position2 === "bottom-right" || position2 === "bottom-left";
    const isLeft = position2 === "left" || position2 === "bottom-left";
    if (savedPos) {
      toolbar.style.cssText = `
      position: fixed; left: ${savedPos.x}px; top: ${savedPos.y}px;
      z-index: 2147483647; display: flex; flex-direction: column;
      align-items: center; gap: 3px; padding: 8px 6px;
      background: var(--tb-toolbar-bg, #0f0f1aee); border: 1px solid var(--tb-border, #2a2a3e);
      border-radius: 14px; box-shadow: var(--tb-shadow-md, 0 4px 24px rgba(0,0,0,0.5));
      transition: none; cursor: grab;
    `;
    } else if (isBottom) {
      toolbar.style.cssText = `
      position: fixed; ${isLeft ? "left" : "right"}: 12px; bottom: 12px;
      z-index: 2147483647; display: flex; flex-direction: row;
      align-items: center; gap: 3px; padding: 6px 8px;
      background: var(--tb-toolbar-bg, #0f0f1aee); border: 1px solid var(--tb-border, #2a2a3e);
      border-radius: 14px; box-shadow: var(--tb-shadow-md, 0 4px 24px rgba(0,0,0,0.5));
      transition: all 0.3s ease;
    `;
    } else {
      toolbar.style.cssText = `
      position: fixed; ${isLeft ? "left" : "right"}: 12px; top: 50%; transform: translateY(-50%);
      z-index: 2147483647; display: flex; flex-direction: column;
      align-items: center; gap: 3px; padding: 8px 6px;
      background: var(--tb-toolbar-bg, #0f0f1aee); border: 1px solid var(--tb-border, #2a2a3e);
      border-radius: 14px; box-shadow: var(--tb-shadow-md, 0 4px 24px rgba(0,0,0,0.5));
      transition: ${isLeft ? "left" : "right"} 0.3s ease;
    `;
    }
  }
  function _initDrag(toolbar) {
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    let hasMoved = false;
    const onMouseDown = (e2) => {
      if (e2.target.tagName === "BUTTON" || e2.target.closest("button")) return;
      isDragging = true;
      hasMoved = false;
      startX = e2.clientX;
      startY = e2.clientY;
      const rect = toolbar.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      toolbar.style.cursor = "grabbing";
      toolbar.style.transition = "none";
      e2.preventDefault();
    };
    const onMouseMove = (e2) => {
      if (!isDragging) return;
      const dx = e2.clientX - startX;
      const dy = e2.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasMoved = true;
      if (!hasMoved) return;
      const newLeft = Math.max(0, Math.min(window.innerWidth - 60, startLeft + dx));
      const newTop = Math.max(0, Math.min(window.innerHeight - 60, startTop + dy));
      toolbar.style.left = `${newLeft}px`;
      toolbar.style.top = `${newTop}px`;
      toolbar.style.right = "auto";
      toolbar.style.bottom = "auto";
      toolbar.style.transform = "none";
    };
    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      toolbar.style.cursor = "grab";
      if (hasMoved) {
        try {
          localStorage.setItem(DRAG_POS_KEY, JSON.stringify({
            x: parseInt(toolbar.style.left),
            y: parseInt(toolbar.style.top)
          }));
        } catch (e2) {
        }
      }
    };
    toolbar.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    toolbar.addEventListener("touchstart", (e2) => {
      if (e2.target.tagName === "BUTTON" || e2.target.closest("button")) return;
      const touch = e2.touches[0];
      isDragging = true;
      hasMoved = false;
      startX = touch.clientX;
      startY = touch.clientY;
      const rect = toolbar.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      toolbar.style.transition = "none";
    }, { passive: true });
    document.addEventListener("touchmove", (e2) => {
      if (!isDragging) return;
      const touch = e2.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasMoved = true;
      if (!hasMoved) return;
      const newLeft = Math.max(0, Math.min(window.innerWidth - 60, startLeft + dx));
      const newTop = Math.max(0, Math.min(window.innerHeight - 60, startTop + dy));
      toolbar.style.left = `${newLeft}px`;
      toolbar.style.top = `${newTop}px`;
      toolbar.style.right = "auto";
      toolbar.style.bottom = "auto";
      toolbar.style.transform = "none";
    }, { passive: true });
    document.addEventListener("touchend", () => {
      if (!isDragging) return;
      isDragging = false;
      if (hasMoved) {
        try {
          localStorage.setItem(DRAG_POS_KEY, JSON.stringify({
            x: parseInt(toolbar.style.left),
            y: parseInt(toolbar.style.top)
          }));
        } catch (e2) {
        }
      }
    });
  }
  function _convertToFab(toolbar, root, panel, showToast3) {
    const buttons = Array.from(toolbar.children);
    buttons.forEach((b) => {
      const el = b;
      if (el.id !== "tracebug-toolbar-panel-btn" && el.id !== "tracebug-toolbar-rec-dot") {
        el.style.display = _fabExpanded ? "" : "none";
      }
    });
    toolbar.style.cssText = `
    position: fixed; right: 12px; bottom: 12px;
    z-index: 2147483647; display: flex; flex-direction: column;
    align-items: center; gap: 3px; padding: ${_fabExpanded ? "8px 6px" : "6px"};
    background: var(--tb-toolbar-bg, #0f0f1aee); border: 1px solid var(--tb-border, #2a2a3e);
    border-radius: ${_fabExpanded ? "14px" : "50%"};
    box-shadow: var(--tb-shadow-md, 0 4px 24px rgba(0,0,0,0.5));
    min-width: 44px; min-height: 44px;
    transition: all 0.2s ease;
  `;
    panel.style.width = "100vw";
    panel.style.height = "80vh";
    panel.style.bottom = _panelOpen ? "0" : "-85vh";
    panel.style.right = "0";
    panel.style.top = "auto";
    panel.style.borderRadius = "16px 16px 0 0";
  }
  function _restoreToolbar(toolbar) {
    const buttons = Array.from(toolbar.children);
    buttons.forEach((b) => b.style.display = "");
    _applyToolbarPosition(toolbar, _position);
    if (_panelEl) {
      _panelEl.style.width = "";
      _panelEl.style.height = "";
      _panelEl.style.bottom = "";
      _panelEl.style.top = "";
      _panelEl.style.borderRadius = "";
      _panelEl.style.right = _panelOpen ? "0" : "-480px";
    }
  }
  function _logoSvg() {
    return `<svg width="18" height="18" viewBox="0 0 96 96" fill="none"><defs><linearGradient id="tb-cr" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#9B7DFF"/><stop offset="50%" stop-color="#7B61FF"/><stop offset="100%" stop-color="#00E5FF"/></linearGradient></defs><path d="M48 20 L66 30 L66 52 L48 62 L30 52 L30 30 Z" fill="url(#tb-cr)" opacity="0.18"/><path d="M48 20 L66 30 L66 52 L48 62 L30 52 L30 30 Z" fill="none" stroke="url(#tb-cr)" stroke-width="2.5"/><circle cx="48" cy="41" r="5" fill="url(#tb-cr)"/><circle cx="48" cy="41" r="2.2" fill="white"/></svg>`;
  }

  // src/dashboard.ts
  init_quick_bug();
  init_helpers();
  var PANEL_ID2 = "tracebug-dashboard-panel";
  var _isRecording2 = true;
  var _onToggleRecording2 = null;
  function setRecordingState(isRecording2, onToggle) {
    _isRecording2 = isRecording2;
    _onToggleRecording2 = onToggle;
    setToolbarRecordingState(isRecording2, onToggle);
  }
  function updateRecordingState(isRecording2) {
    _isRecording2 = isRecording2;
    updateToolbarRecordingState(isRecording2);
    const indicator = document.getElementById("bt-rec-indicator");
    if (indicator) {
      indicator.style.background = isRecording2 ? "var(--tb-success, #22c55e)" : "var(--tb-error, #ef4444)";
      indicator.title = isRecording2 ? "Recording" : "Paused";
    }
    const recBtn = document.getElementById("bt-rec-toggle");
    if (recBtn) {
      recBtn.textContent = isRecording2 ? "\u23F8 Pause" : "\u25B6 Record";
      recBtn.style.color = isRecording2 ? "var(--tb-warning, #fbbf24)" : "var(--tb-success, #22c55e)";
      recBtn.style.borderColor = isRecording2 ? "var(--tb-warning, #fbbf24)44" : "var(--tb-success, #22c55e)44";
      recBtn.style.background = isRecording2 ? "var(--tb-warning-bg, #fbbf2422)" : "var(--tb-success-bg, #22c55e22)";
    }
  }
  function mountDashboard(toolbarPosition, shortcuts) {
    if (document.getElementById("tracebug-compact-toolbar")) return () => {
    };
    const style = document.createElement("style");
    style.id = "tracebug-styles";
    style.textContent = `
    #tracebug-root {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 0 !important;
      height: 0 !important;
      overflow: visible !important;
      z-index: 2147483647 !important;
      pointer-events: none !important;
      isolation: isolate !important;
    }
    #tracebug-root * {
      pointer-events: auto;
    }
    #${PANEL_ID2} {
      position: fixed !important;
      top: 0 !important;
      width: 470px !important;
      height: 100vh !important;
      z-index: 2147483647 !important;
      background: var(--tb-panel-bg, #0f0f1a) !important;
      border-left: 1px solid var(--tb-border, #2a2a3e) !important;
      color: var(--tb-text-primary, #e0e0e0) !important;
      font-family: var(--tb-font-mono, 'SF Mono', Consolas, monospace), var(--tb-font-family, system-ui, sans-serif) !important;
      font-size: 13px !important;
      overflow: hidden !important;
      transition: right 0.3s ease, left 0.3s ease, bottom 0.3s ease !important;
      display: flex !important;
      flex-direction: column !important;
      box-shadow: var(--tb-shadow-lg, -4px 0 30px rgba(0,0,0,0.6)) !important;
    }
    @media (max-width: 767px) {
      #${PANEL_ID2} {
        width: 100vw !important;
        height: 80vh !important;
        top: auto !important;
        border-radius: 16px 16px 0 0 !important;
        border-left: none !important;
        border-top: 1px solid var(--tb-border, #2a2a3e) !important;
      }
    }
    /* Accessibility: visible focus rings */
    #tracebug-root button:focus-visible,
    #tracebug-root input:focus-visible,
    #tracebug-root select:focus-visible,
    #tracebug-root textarea:focus-visible,
    #tracebug-root [tabindex]:focus-visible {
      outline: 2px solid var(--tb-accent, #7B61FF) !important;
      outline-offset: 2px !important;
    }
    #tracebug-root *:focus:not(:focus-visible) {
      outline: none !important;
    }
  `;
    document.head.appendChild(style);
    const root = document.createElement("div");
    root.id = "tracebug-root";
    root.setAttribute("role", "complementary");
    root.setAttribute("aria-label", "TraceBug QA tools");
    const panel = document.createElement("div");
    panel.id = PANEL_ID2;
    panel.style.right = "-480px";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "false");
    panel.setAttribute("aria-label", "TraceBug session panel");
    const liveRegion = document.createElement("div");
    liveRegion.id = "tracebug-live";
    liveRegion.setAttribute("aria-live", "polite");
    liveRegion.setAttribute("aria-atomic", "true");
    liveRegion.style.cssText = "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)";
    root.appendChild(liveRegion);
    root.appendChild(panel);
    document.documentElement.appendChild(root);
    setRenderPanel(renderPanel);
    const cleanupToolbar = mountCompactToolbar(root, panel, showToast2, renderAnnotationList, toolbarPosition, shortcuts);
    showAnnotationBadges(root);
    injectOnboardingStyles();
    startOnboarding(root);
    addLogoPulse();
    const screenshotShortcut = (shortcuts == null ? void 0 : shortcuts.screenshot) || "ctrl+shift+s";
    const keyHandler = async (e2) => {
      if (matchesShortcut(e2, "ctrl+shift+b")) {
        e2.preventDefault();
        if (!isQuickBugOpen()) {
          showQuickBugCapture(root).catch((err) => {
            console.warn("[TraceBug] Quick bug capture failed:", err);
            showToast2("Quick capture failed", root);
          });
        }
        return;
      }
      if (matchesShortcut(e2, screenshotShortcut)) {
        e2.preventDefault();
        const sessions = getAllSessions().sort((a2, b) => b.updatedAt - a2.updatedAt);
        const currentSession = sessions[0];
        const lastEvent = (currentSession == null ? void 0 : currentSession.events[currentSession.events.length - 1]) || null;
        showToast2("Capturing screenshot...", root);
        try {
          const ss = await captureScreenshot(lastEvent);
          showToast2(`Screenshot: ${ss.filename}`, root);
          showAnnotationEditor(ss, root);
        } catch (e3) {
          showToast2("Screenshot failed", root);
        }
      }
    };
    document.addEventListener("keydown", keyHandler);
    return () => {
      root.remove();
      style.remove();
      cleanupToolbar();
      clearAnnotationBadges();
      cleanupOnboarding();
      document.removeEventListener("keydown", keyHandler);
    };
  }
  function renderPanel(panel) {
    const sessions = getAllSessions().sort((a2, b) => b.updatedAt - a2.updatedAt);
    const errorSessions = sessions.filter((s) => s.errorMessage);
    const allSessions = sessions;
    panel.innerHTML = `
    <div style="padding:16px 20px;border-bottom:1px solid var(--tb-border, #2a2a3e);display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
      <div>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="font-size:16px;font-weight:700;color:var(--tb-text-primary, #fff);font-family:var(--tb-font-family, system-ui,sans-serif);display:flex;align-items:center;gap:6px"><svg width="18" height="18" viewBox="0 0 96 96" fill="none"><defs><linearGradient id="th-p" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#9B7DFF"/><stop offset="50%" stop-color="#7B61FF"/><stop offset="100%" stop-color="#00E5FF"/></linearGradient><linearGradient id="th-s" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#00E5FF" stop-opacity="0"/><stop offset="35%" stop-color="#00E5FF" stop-opacity="0.9"/><stop offset="65%" stop-color="#7B61FF" stop-opacity="0.9"/><stop offset="100%" stop-color="#7B61FF" stop-opacity="0"/></linearGradient></defs><path d="M48 20 L66 30 L66 52 L48 62 L30 52 L30 30 Z" fill="url(#th-p)" opacity="0.18"/><path d="M48 20 L66 30 L66 52 L48 62 L30 52 L30 30 Z" fill="none" stroke="url(#th-p)" stroke-width="2.5"/><rect x="22" y="39" width="52" height="3" rx="1.5" fill="url(#th-s)" opacity="0.95"/><line x1="34" y1="29" x2="21" y2="16" stroke="#9B7DFF" stroke-width="2.5" stroke-linecap="round"/><circle cx="21" cy="16" r="3.5" fill="#9B7DFF"/><line x1="62" y1="29" x2="75" y2="16" stroke="#00E5FF" stroke-width="2.5" stroke-linecap="round"/><circle cx="75" cy="16" r="3.5" fill="#00E5FF"/><circle cx="48" cy="41" r="5" fill="url(#th-p)"/><circle cx="48" cy="41" r="2.2" fill="white"/><circle cx="41" cy="34" r="2.5" fill="#00E5FF" opacity="0.9"/><circle cx="55" cy="34" r="2.5" fill="#9B7DFF" opacity="0.9"/></svg>TraceBug AI</div>
          <div id="bt-rec-indicator" style="width:8px;height:8px;border-radius:50%;background:${_isRecording2 ? "var(--tb-success, #22c55e)" : "var(--tb-error, #ef4444)"};animation:${_isRecording2 ? "bt-pulse 2s infinite" : "none"}" title="${_isRecording2 ? "Recording" : "Paused"}"></div>
        </div>
        <div style="font-size:11px;color:var(--tb-text-muted, #666);margin-top:2px">${errorSessions.length} error${errorSessions.length !== 1 ? "s" : ""} \xB7 ${allSessions.length} session${allSessions.length !== 1 ? "s" : ""}</div>
      </div>
      <div style="display:flex;gap:6px">
        <button id="bt-rec-toggle" style="${smallBtnStyle(_isRecording2 ? "#fbbf24" : "#22c55e")}font-size:10px">${_isRecording2 ? "\u23F8 Pause" : "\u25B6 Record"}</button>
        <button id="bt-refresh" style="${smallBtnStyle("#3b82f6")}font-size:10px">\u21BB</button>
        <button id="bt-clear" style="${smallBtnStyle("#ef4444")}font-size:10px">Clear</button>
      </div>
    </div>
    <style>@keyframes bt-pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }</style>
    <div id="bt-content" style="flex:1;overflow-y:auto;padding:12px 16px"></div>
  `;
    const content2 = panel.querySelector("#bt-content");
    panel.querySelector("#bt-refresh").addEventListener("click", () => renderPanel(panel));
    panel.querySelector("#bt-clear").addEventListener("click", () => {
      if (confirm("Delete all TraceBug data? This clears sessions, screenshots, voice notes, annotations, and the network failure buffer.")) {
        try {
          clearAllSessions();
        } catch (e2) {
        }
        try {
          clearScreenshots();
        } catch (e2) {
        }
        try {
          clearVoiceTranscripts();
        } catch (e2) {
        }
        try {
          clearAllAnnotations();
        } catch (e2) {
        }
        try {
          clearAnnotationBadges();
        } catch (e2) {
        }
        try {
          clearNetworkFailures();
        } catch (e2) {
        }
        renderPanel(panel);
      }
    });
    panel.querySelector("#bt-rec-toggle").addEventListener("click", () => {
      if (_onToggleRecording2) _onToggleRecording2();
    });
    if (allSessions.length === 0) {
      content2.innerHTML = `
      <div style="text-align:center;padding:60px 20px;color:var(--tb-text-muted, #555)">
        <div style="font-size:36px;margin-bottom:12px">\u{1F50D}</div>
        <div style="font-family:var(--tb-font-family, system-ui,sans-serif)">No sessions recorded yet.</div>
        <div style="font-size:11px;margin-top:8px;color:var(--tb-text-muted, #444)">Interact with the app to start capturing events.</div>
      </div>
    `;
      return;
    }
    const filterBar = document.createElement("div");
    filterBar.dataset.tracebug = "filter-bar";
    filterBar.style.cssText = "margin-bottom:10px;display:flex;gap:6px;flex-wrap:wrap";
    filterBar.innerHTML = `
    <input id="bt-search" type="text" placeholder="Search sessions..." style="
      flex:1;min-width:120px;background:var(--tb-bg-secondary, #1a1a2e);border:1px solid var(--tb-border, #2a2a3e);
      border-radius:var(--tb-radius-md, 6px);color:var(--tb-text-primary, #e0e0e0);padding:6px 10px;
      font-size:11px;font-family:var(--tb-font-family, inherit);outline:none;
    " />
    <select id="bt-filter" style="
      background:var(--tb-bg-secondary, #1a1a2e);border:1px solid var(--tb-border, #2a2a3e);
      border-radius:var(--tb-radius-md, 6px);color:var(--tb-text-primary, #e0e0e0);padding:6px 8px;
      font-size:11px;font-family:var(--tb-font-family, inherit);cursor:pointer;
    ">
      <option value="all">All</option>
      <option value="errors">Has errors</option>
      <option value="healthy">Healthy</option>
    </select>
  `;
    content2.innerHTML = "";
    content2.appendChild(filterBar);
    const sessionsContainer = document.createElement("div");
    sessionsContainer.id = "bt-sessions-list";
    content2.appendChild(sessionsContainer);
    function renderFilteredSessions(filter, search) {
      sessionsContainer.innerHTML = "";
      let filtered = allSessions;
      if (filter === "errors") filtered = filtered.filter((s) => s.errorMessage);
      if (filter === "healthy") filtered = filtered.filter((s) => !s.errorMessage);
      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter(
          (s) => s.sessionId.toLowerCase().includes(q) || s.errorMessage && s.errorMessage.toLowerCase().includes(q) || s.events.some((e2) => e2.page.toLowerCase().includes(q))
        );
      }
      if (filtered.length === 0) {
        sessionsContainer.innerHTML = `<div style="text-align:center;padding:30px;color:var(--tb-text-muted, #555);font-size:12px">No matching sessions</div>`;
        return;
      }
      for (const session of filtered) {
        sessionsContainer.appendChild(_createSessionCard(session, panel));
      }
    }
    renderFilteredSessions("all", "");
    content2.querySelector("#bt-search").addEventListener("input", (e2) => {
      const search = e2.target.value;
      const filter = content2.querySelector("#bt-filter").value;
      renderFilteredSessions(filter, search);
    });
    content2.querySelector("#bt-filter").addEventListener("change", (e2) => {
      const filter = e2.target.value;
      const search = content2.querySelector("#bt-search").value;
      renderFilteredSessions(filter, search);
    });
  }
  function _createSessionCard(session, panel) {
    const card = document.createElement("div");
    card.style.cssText = "border:1px solid var(--tb-border, #2a2a3e);border-radius:var(--tb-radius-md, 8px);padding:12px;margin-bottom:10px;cursor:pointer;transition:border-color 0.2s";
    card.onmouseenter = () => card.style.borderColor = "var(--tb-border-hover, #4a4a6e)";
    card.onmouseleave = () => card.style.borderColor = "var(--tb-border, #2a2a3e)";
    const hasError = !!session.errorMessage;
    const dot = hasError ? '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--tb-error, #ef4444);margin-right:6px"></span>' : '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--tb-success, #22c55e);margin-right:6px"></span>';
    const badge = session.reproSteps ? '<span style="font-size:10px;background:#14532d;color:#4ade80;padding:2px 6px;border-radius:var(--tb-radius-sm, 4px);margin-left:6px">Repro Ready</span>' : "";
    const lastEvent = session.events[session.events.length - 1];
    let preview = `${session.events.length} events`;
    if (hasError) {
      preview = session.errorMessage.slice(0, 60) + (session.errorMessage.length > 60 ? "..." : "");
    } else if (lastEvent) {
      preview = describeEvent(lastEvent).slice(0, 60);
    }
    const pages = [...new Set(session.events.map((e2) => e2.page))];
    const sessionName = pages.length > 0 ? _pageName(pages[0]) + " Session" : "Session";
    card.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between">
      <div style="display:flex;align-items:center">
        ${dot}
        <span style="color:var(--tb-text-primary, #e0e0e0);font-size:12px;font-weight:600">${escapeHtml3(sessionName)}</span>
        ${badge}
      </div>
      <span style="color:var(--tb-text-muted, #555);font-size:10px">${timeAgo(session.updatedAt)}</span>
    </div>
    <div style="color:var(--tb-text-muted, ${hasError ? "#f87171" : "#888"});font-size:11px;margin-top:6px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml3(preview)}</div>
    <div style="color:var(--tb-text-muted, #555);font-size:10px;margin-top:4px">${session.events.length} events \xB7 ${pages.length} page${pages.length !== 1 ? "s" : ""}</div>
  `;
    card.onclick = () => renderSessionDetail(panel, session);
    return card;
  }
  function _pageName(path) {
    if (!path || path === "/") return "Home";
    const parts = path.split("/").filter(Boolean);
    const last = parts[parts.length - 1] || "Home";
    return last.charAt(0).toUpperCase() + last.slice(1).replace(/[-_]/g, " ");
  }
  function renderSessionDetail(panel, session) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m;
    const content2 = panel.querySelector("#bt-content");
    const s = session;
    const problems = [];
    const apiEvents = s.events.filter((e2) => e2.type === "api_request");
    const errorEvents = s.events.filter((e2) => ["error", "unhandled_rejection"].includes(e2.type));
    const consoleErrors = s.events.filter((e2) => e2.type === "console_error");
    const failedApis = apiEvents.filter((e2) => {
      var _a2, _b2;
      return ((_a2 = e2.data.request) == null ? void 0 : _a2.statusCode) >= 400 || ((_b2 = e2.data.request) == null ? void 0 : _b2.statusCode) === 0;
    });
    const slowApis = apiEvents.filter((e2) => {
      var _a2;
      return ((_a2 = e2.data.request) == null ? void 0 : _a2.durationMs) > 3e3;
    });
    for (const ev of errorEvents) {
      const errType = getErrorType(((_a = ev.data.error) == null ? void 0 : _a.message) || "");
      problems.push({ severity: "critical", icon: "\u{1F4A5}", title: `${errType.type}: Runtime Exception`, detail: ((_b = ev.data.error) == null ? void 0 : _b.message) || "Unknown error", color: "#ef4444" });
    }
    for (const ev of failedApis) {
      const r = ev.data.request;
      const code = (r == null ? void 0 : r.statusCode) || 0;
      const severity = code >= 500 || code === 0 ? "critical" : "warning";
      problems.push({ severity, icon: code === 0 ? "\u{1F50C}" : "\u{1F6AB}", title: `HTTP ${code} \u2014 ${getStatusLabel(code)}`, detail: `${r == null ? void 0 : r.method} ${(_c = r == null ? void 0 : r.url) == null ? void 0 : _c.slice(0, 80)}`, color: getStatusColor(code) });
    }
    for (const ev of slowApis) {
      const r = ev.data.request;
      if (!failedApis.includes(ev)) {
        problems.push({ severity: "warning", icon: "\u{1F40C}", title: `Slow Response \u2014 ${formatDuration(r == null ? void 0 : r.durationMs)}`, detail: `${r == null ? void 0 : r.method} ${(_d = r == null ? void 0 : r.url) == null ? void 0 : _d.slice(0, 80)}`, color: "#f97316" });
      }
    }
    for (const ev of consoleErrors) {
      const msg = ((_e = ev.data.error) == null ? void 0 : _e.message) || "";
      if (!msg.includes("Warning:") && !msg.includes("ReactDOM")) {
        problems.push({ severity: "info", icon: "\u26A0\uFE0F", title: "Console Error", detail: msg.slice(0, 120), color: "#fb923c" });
      }
    }
    const firstTs = s.events.length > 0 ? s.events[0].timestamp : s.createdAt;
    const lastTs = s.events.length > 0 ? s.events[s.events.length - 1].timestamp : s.createdAt;
    const sessionDur = lastTs - firstTs;
    const avgApiTime = apiEvents.length > 0 ? Math.round(apiEvents.reduce((sum, e2) => {
      var _a2;
      return sum + (((_a2 = e2.data.request) == null ? void 0 : _a2.durationMs) || 0);
    }, 0) / apiEvents.length) : 0;
    const maxApiTime = apiEvents.length > 0 ? Math.max(...apiEvents.map((e2) => {
      var _a2;
      return ((_a2 = e2.data.request) == null ? void 0 : _a2.durationMs) || 0;
    })) : 0;
    const pagesVisited = new Set(s.events.map((e2) => e2.page)).size;
    const bugTitle = generateBugTitle(s) || "Session Details";
    const severityBadge = problems.some((p) => p.severity === "critical") ? `<span style="font-size:9px;padding:2px 8px;border-radius:10px;background:#7f1d1d;color:#fca5a5">Critical</span>` : problems.length > 0 ? `<span style="font-size:9px;padding:2px 8px;border-radius:10px;background:#78350f;color:var(--tb-warning, #fbbf24)">Warning</span>` : `<span style="font-size:9px;padding:2px 8px;border-radius:10px;background:#14532d;color:#4ade80">Healthy</span>`;
    const hasErrors = errorEvents.length > 0 || s.errorMessage;
    let html = "";
    html += `<div style="position:sticky;top:0;z-index:10;background:var(--tb-panel-bg, #0f0f1a);margin:-12px -16px 12px -16px;padding:12px 16px 0 16px;border-bottom:1px solid var(--tb-border, #2a2a3e)">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
      <button id="bt-back" style="background:none;border:none;color:var(--tb-info, #3b82f6);cursor:pointer;font-size:12px;padding:0;font-family:var(--tb-font-family, inherit)">\u2190 Back</button>
      ${severityBadge}
    </div>
    <div style="font-size:14px;font-weight:700;color:var(--tb-text-primary, #fff);font-family:var(--tb-font-family, system-ui,sans-serif);line-height:1.3;margin-bottom:10px">${escapeHtml3(bugTitle)}</div>
    <div id="bt-tab-bar" style="display:flex;gap:0;overflow-x:auto">
      <button class="bt-tab bt-tab-active" data-tab="overview" style="${_tabBtnStyle(true)}">Overview</button>
      <button class="bt-tab" data-tab="timeline" style="${_tabBtnStyle(false)}">Timeline</button>
      ${hasErrors ? `<button class="bt-tab" data-tab="errors" style="${_tabBtnStyle(false)}">Errors <span style="background:var(--tb-error, #ef4444);color:#fff;font-size:8px;padding:1px 5px;border-radius:6px;margin-left:2px">${errorEvents.length}</span></button>` : ""}
      <button class="bt-tab" data-tab="export" style="${_tabBtnStyle(false)}">Export</button>
    </div>
  </div>`;
    html += `<div id="bt-tab-overview" class="bt-tab-content">`;
    html += `<div style="background:#0c1222;border:1px solid #1e3a5f;border-radius:10px;padding:10px;margin-bottom:14px">
    <div style="font-size:10px;color:#60a5fa;font-weight:700;margin-bottom:8px;font-family:var(--tb-font-family, system-ui,sans-serif)">QA TOOLS</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <button id="bt-screenshot" style="${smallBtnStyle("#22d3ee")}font-size:10px">\u{1F4F8} Screenshot</button>
      <button id="bt-add-note" style="${smallBtnStyle("#a78bfa")}font-size:10px">\u{1F4DD} Add Note</button>
      <button id="bt-voice-note" style="${smallBtnStyle("#f59e0b")}font-size:10px;${isVoiceSupported() ? "" : "display:none"}">\u{1F3A4} Voice</button>
    </div>
  </div>`;
    html += `<div style="background:var(--tb-bg-primary, #12121f);border:1px solid var(--tb-border, #2a2a3e);border-radius:10px;padding:14px;margin-bottom:14px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <div style="font-size:13px;font-weight:700;color:var(--tb-text-primary, #fff);font-family:var(--tb-font-family, system-ui,sans-serif)">Session Overview</div>
      <span style="font-size:10px;padding:2px 8px;border-radius:10px;background:${problems.some((p) => p.severity === "critical") ? "#7f1d1d" : problems.length > 0 ? "#78350f" : "#14532d"};color:${problems.some((p) => p.severity === "critical") ? "#fca5a5" : problems.length > 0 ? "#fbbf24" : "#4ade80"};font-family:var(--tb-font-family, system-ui,sans-serif)">${problems.some((p) => p.severity === "critical") ? "Has Errors" : problems.length > 0 ? "Has Warnings" : "Healthy"}</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div style="background:var(--tb-bg-primary, #0f0f1a);border-radius:var(--tb-radius-md, 6px);padding:8px 10px">
        <div style="font-size:9px;color:var(--tb-text-muted, #555);text-transform:uppercase;letter-spacing:0.5px;font-family:var(--tb-font-family, system-ui,sans-serif)">Duration</div>
        <div style="font-size:14px;color:var(--tb-text-primary, #e0e0e0);margin-top:2px">${formatDuration(sessionDur)}</div>
      </div>
      <div style="background:var(--tb-bg-primary, #0f0f1a);border-radius:var(--tb-radius-md, 6px);padding:8px 10px">
        <div style="font-size:9px;color:var(--tb-text-muted, #555);text-transform:uppercase;letter-spacing:0.5px;font-family:var(--tb-font-family, system-ui,sans-serif)">Events</div>
        <div style="font-size:14px;color:var(--tb-text-primary, #e0e0e0);margin-top:2px">${s.events.length}</div>
      </div>
      <div style="background:var(--tb-bg-primary, #0f0f1a);border-radius:var(--tb-radius-md, 6px);padding:8px 10px">
        <div style="font-size:9px;color:var(--tb-text-muted, #555);text-transform:uppercase;letter-spacing:0.5px;font-family:var(--tb-font-family, system-ui,sans-serif)">Pages Visited</div>
        <div style="font-size:14px;color:var(--tb-text-primary, #e0e0e0);margin-top:2px">${pagesVisited}</div>
      </div>
      <div style="background:var(--tb-bg-primary, #0f0f1a);border-radius:var(--tb-radius-md, 6px);padding:8px 10px">
        <div style="font-size:9px;color:var(--tb-text-muted, #555);text-transform:uppercase;letter-spacing:0.5px;font-family:var(--tb-font-family, system-ui,sans-serif)">API Calls</div>
        <div style="font-size:14px;color:var(--tb-text-primary, #e0e0e0);margin-top:2px">${apiEvents.length} <span style="font-size:10px;color:${failedApis.length > 0 ? "#ef4444" : "#22c55e"}">(${failedApis.length} failed)</span></div>
      </div>
    </div>
    <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
      <span style="font-size:10px;color:var(--tb-text-muted, #555)">ID: ${s.sessionId.slice(0, 8)}\u2026</span>
      <span style="font-size:10px;color:var(--tb-text-muted, #444)">\xB7</span>
      <span style="font-size:10px;color:var(--tb-text-muted, #555)">${new Date(s.createdAt).toLocaleString()}</span>
    </div>
  </div>`;
    if (problems.length > 0) {
      const criticalCount = problems.filter((p) => p.severity === "critical").length;
      const warningCount = problems.filter((p) => p.severity === "warning").length;
      const infoCount = problems.filter((p) => p.severity === "info").length;
      html += `<div style="border:1px solid ${criticalCount > 0 ? "#7f1d1d" : "#78350f"};background:${criticalCount > 0 ? "#1a0505" : "#1a1005"};border-radius:10px;padding:14px;margin-bottom:14px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div style="font-size:13px;font-weight:700;color:${criticalCount > 0 ? "#fca5a5" : "#fbbf24"};font-family:var(--tb-font-family, system-ui,sans-serif)">\u{1F50D} Problems Detected (${problems.length})</div>
        <div style="display:flex;gap:6px">
          ${criticalCount > 0 ? `<span style="font-size:9px;padding:2px 6px;border-radius:3px;background:#7f1d1d;color:#fca5a5">${criticalCount} Critical</span>` : ""}
          ${warningCount > 0 ? `<span style="font-size:9px;padding:2px 6px;border-radius:3px;background:#78350f;color:var(--tb-warning, #fbbf24)">${warningCount} Warning</span>` : ""}
          ${infoCount > 0 ? `<span style="font-size:9px;padding:2px 6px;border-radius:3px;background:#1e1533;color:#c084fc">${infoCount} Info</span>` : ""}
        </div>
      </div>`;
      for (const p of problems) {
        const sevBorder = p.severity === "critical" ? "#7f1d1d" : p.severity === "warning" ? "#78350f" : "#2a2a3e";
        const sevBg = p.severity === "critical" ? "#0f0205" : p.severity === "warning" ? "#0f0a02" : "#12121f";
        html += `<div style="border:1px solid ${sevBorder};background:${sevBg};border-radius:var(--tb-radius-md, 6px);padding:10px;margin-bottom:6px">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
          <span style="font-size:13px">${p.icon}</span>
          <span style="font-size:11px;font-weight:600;color:${p.color};font-family:var(--tb-font-family, system-ui,sans-serif)">${escapeHtml3(p.title)}</span>
        </div>
        <div style="color:var(--tb-text-muted, #888);font-size:11px;line-height:1.4;padding-left:22px;word-break:break-word">${escapeHtml3(p.detail)}</div>
      </div>`;
      }
      html += `</div>`;
    }
    if (s.errorMessage) {
      const errType = getErrorType(s.errorMessage);
      html += `<div style="border:1px solid #7f1d1d;background:#1a0505;border-radius:10px;padding:14px;margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span style="font-size:13px;font-weight:700;color:#fca5a5;font-family:var(--tb-font-family, system-ui,sans-serif)">Error Details</span>
        <span style="font-size:9px;padding:2px 6px;border-radius:3px;background:${errType.color}22;color:${errType.color};border:1px solid ${errType.color}44">${errType.type}</span>
      </div>
      <div style="background:#0f0205;border-radius:var(--tb-radius-md, 6px);padding:10px;margin-bottom:8px">
        <div style="font-size:9px;color:var(--tb-text-muted, #666);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;font-family:var(--tb-font-family, system-ui,sans-serif)">Error Message</div>
        <div style="color:#fca5a5;font-size:12px;line-height:1.5;word-break:break-word">${escapeHtml3(s.errorMessage)}</div>
      </div>`;
      if (s.errorStack) {
        const locationMatch = s.errorStack.match(/at\s+(\S+)\s+\(([^)]+)\)/);
        if (locationMatch) {
          html += `<div style="background:#0f0205;border-radius:var(--tb-radius-md, 6px);padding:10px;margin-bottom:8px">
          <div style="font-size:9px;color:var(--tb-text-muted, #666);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;font-family:var(--tb-font-family, system-ui,sans-serif)">Error Location</div>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:12px;color:#60a5fa">${escapeHtml3(locationMatch[1])}</span>
            <span style="font-size:10px;color:var(--tb-text-muted, #555)">at</span>
            <span style="font-size:10px;color:var(--tb-text-muted, #888);word-break:break-all">${escapeHtml3(locationMatch[2])}</span>
          </div>
        </div>`;
        }
        html += `<details style="margin-top:4px">
        <summary style="font-size:10px;color:var(--tb-text-muted, #555);cursor:pointer;user-select:none;font-family:var(--tb-font-family, system-ui,sans-serif)">View Full Stack Trace</summary>
        <pre style="color:#dc262690;font-size:10px;margin-top:6px;white-space:pre-wrap;line-height:1.4;max-height:150px;overflow:auto;background:#0a0a0a;padding:8px;border-radius:var(--tb-radius-sm, 4px)">${escapeHtml3(s.errorStack)}</pre>
      </details>`;
      }
      html += `</div>`;
    }
    if (apiEvents.length > 0) {
      html += `<div style="background:var(--tb-bg-primary, #12121f);border:1px solid var(--tb-border, #2a2a3e);border-radius:10px;padding:14px;margin-bottom:14px">
      <div style="font-size:13px;font-weight:700;color:var(--tb-text-primary, #fff);margin-bottom:10px;font-family:var(--tb-font-family, system-ui,sans-serif)">\u26A1 Performance</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px">
        <div style="background:var(--tb-bg-primary, #0f0f1a);border-radius:var(--tb-radius-md, 6px);padding:8px;text-align:center">
          <div style="font-size:9px;color:var(--tb-text-muted, #555);text-transform:uppercase;font-family:var(--tb-font-family, system-ui,sans-serif)">Avg</div>
          <div style="font-size:13px;color:${getSpeedLabel(avgApiTime).color};margin-top:2px">${formatDuration(avgApiTime)}</div>
        </div>
        <div style="background:var(--tb-bg-primary, #0f0f1a);border-radius:var(--tb-radius-md, 6px);padding:8px;text-align:center">
          <div style="font-size:9px;color:var(--tb-text-muted, #555);text-transform:uppercase;font-family:var(--tb-font-family, system-ui,sans-serif)">Slowest</div>
          <div style="font-size:13px;color:${getSpeedLabel(maxApiTime).color};margin-top:2px">${formatDuration(maxApiTime)}</div>
        </div>
        <div style="background:var(--tb-bg-primary, #0f0f1a);border-radius:var(--tb-radius-md, 6px);padding:8px;text-align:center">
          <div style="font-size:9px;color:var(--tb-text-muted, #555);text-transform:uppercase;font-family:var(--tb-font-family, system-ui,sans-serif)">Success</div>
          <div style="font-size:13px;color:${failedApis.length === 0 ? "#22c55e" : "#fbbf24"};margin-top:2px">${apiEvents.length > 0 ? Math.round((apiEvents.length - failedApis.length) / apiEvents.length * 100) : 0}%</div>
        </div>
      </div>`;
      for (const ev of apiEvents) {
        const r = ev.data.request;
        const code = (r == null ? void 0 : r.statusCode) || 0;
        const dur = (r == null ? void 0 : r.durationMs) || 0;
        const speed = getSpeedLabel(dur);
        const statusClr = getStatusColor(code);
        const isFail = code >= 400 || code === 0;
        const urlPath = ((r == null ? void 0 : r.url) || "").replace(/https?:\/\/[^/]+/, "").slice(0, 50);
        html += `<div style="background:${isFail ? "#0f0205" : "#0f0f1a"};border:1px solid ${isFail ? "#7f1d1d44" : "#1e1e32"};border-radius:var(--tb-radius-md, 6px);padding:8px 10px;margin-bottom:4px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:10px;font-weight:600;color:var(--tb-text-primary, #e0e0e0);background:#1e293b;padding:1px 5px;border-radius:3px">${(r == null ? void 0 : r.method) || "GET"}</span>
            <span style="font-size:10px;color:var(--tb-text-muted, #888);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px">${escapeHtml3(urlPath)}</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:10px;font-weight:700;color:${statusClr}">${code}</span>
            <span style="font-size:9px;color:${statusClr}66">${getStatusLabel(code)}</span>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1;height:3px;background:#1e1e32;border-radius:2px;overflow:hidden">
            <div style="height:100%;width:${Math.min(100, dur / Math.max(maxApiTime, 1) * 100)}%;background:${speed.color};border-radius:2px"></div>
          </div>
          <span style="font-size:10px;color:${speed.color};white-space:nowrap">${formatDuration(dur)}</span>
          ${dur > 3e3 ? `<span style="font-size:8px;padding:1px 4px;border-radius:2px;background:${speed.color}22;color:${speed.color}">${speed.label}</span>` : ""}
        </div>
      </div>`;
      }
      html += `</div>`;
    }
    if (s.reproSteps) {
      html += `<div style="border:1px solid #14532d;background:#031a09;border-radius:10px;padding:14px;margin-bottom:14px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div style="font-size:13px;font-weight:700;color:#4ade80;font-family:var(--tb-font-family, system-ui,sans-serif)">\u{1F4CB} Reproduction Steps</div>
        <button id="bt-copy" style="${smallBtnStyle("#3b82f6")}font-size:10px">Copy</button>
      </div>
      <pre style="color:#bbf7d0;font-size:12px;white-space:pre-wrap;line-height:1.7;margin:0">${escapeHtml3(s.reproSteps)}</pre>
      ${s.errorSummary ? `<div style="border-top:1px solid #14532d;margin-top:10px;padding-top:8px"><div style="font-size:10px;font-weight:600;color:#4ade80;margin-bottom:4px;font-family:var(--tb-font-family, system-ui,sans-serif)">Summary</div><pre style="color:#86efac;font-size:11px;white-space:pre-wrap;line-height:1.4;margin:0">${escapeHtml3(s.errorSummary)}</pre></div>` : ""}
    </div>`;
    }
    const annotations = s.annotations || [];
    if (annotations.length > 0) {
      html += `<div style="border:1px solid #1e3a5f;background:#0c1222;border-radius:10px;padding:14px;margin-bottom:14px">
      <div style="font-size:13px;font-weight:700;color:#60a5fa;margin-bottom:10px;font-family:var(--tb-font-family, system-ui,sans-serif)">\u{1F4DD} Tester Notes (${annotations.length})</div>`;
      for (const note of annotations) {
        const sevColor = note.severity === "critical" ? "#ef4444" : note.severity === "major" ? "#f97316" : note.severity === "minor" ? "#3b82f6" : "#888";
        html += `<div style="border:1px solid var(--tb-border, #2a2a3e);background:var(--tb-bg-primary, #12121f);border-radius:var(--tb-radius-md, 6px);padding:10px;margin-bottom:6px">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
          <span style="font-size:9px;padding:1px 6px;border-radius:3px;background:${sevColor}22;color:${sevColor};border:1px solid ${sevColor}44;font-weight:600;text-transform:uppercase">${note.severity}</span>
          <span style="font-size:10px;color:var(--tb-text-muted, #555)">${new Date(note.timestamp).toLocaleTimeString()}</span>
        </div>
        <div style="color:var(--tb-text-primary, #e0e0e0);font-size:12px;line-height:1.4">${escapeHtml3(note.text)}</div>
        ${note.expected ? `<div style="margin-top:4px;font-size:11px"><span style="color:var(--tb-success, #22c55e);font-weight:600">Expected:</span> <span style="color:var(--tb-text-secondary, #aaa)">${escapeHtml3(note.expected)}</span></div>` : ""}
        ${note.actual ? `<div style="margin-top:2px;font-size:11px"><span style="color:var(--tb-error, #ef4444);font-weight:600">Actual:</span> <span style="color:var(--tb-text-secondary, #aaa)">${escapeHtml3(note.actual)}</span></div>` : ""}
      </div>`;
      }
      html += `</div>`;
    }
    const screenshots2 = getScreenshots();
    if (screenshots2.length > 0) {
      html += `<div style="border:1px solid var(--tb-border, #2a2a3e);background:var(--tb-bg-primary, #12121f);border-radius:10px;padding:14px;margin-bottom:14px">
      <div style="font-size:13px;font-weight:700;color:#22d3ee;margin-bottom:10px;font-family:var(--tb-font-family, system-ui,sans-serif)">\u{1F4F8} Screenshots (${screenshots2.length})</div>`;
      for (const ss of screenshots2) {
        html += `<div style="margin-bottom:10px">
        <div style="font-size:10px;color:var(--tb-text-muted, #888);margin-bottom:4px">${escapeHtml3(ss.filename)} \u2014 ${escapeHtml3(ss.page)}</div>
        <img src="${ss.dataUrl}" style="max-width:100%;border:1px solid var(--tb-border, #2a2a3e);border-radius:var(--tb-radius-md, 6px)" />
      </div>`;
      }
      html += `</div>`;
    }
    const envInfo = s.environment;
    if (envInfo) {
      html += `<div style="background:var(--tb-bg-primary, #12121f);border:1px solid var(--tb-border, #2a2a3e);border-radius:10px;padding:14px;margin-bottom:14px">
      <div style="font-size:13px;font-weight:700;color:var(--tb-text-primary, #fff);margin-bottom:10px;font-family:var(--tb-font-family, system-ui,sans-serif)">\u{1F5A5} Environment</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
        <div style="background:var(--tb-bg-primary, #0f0f1a);border-radius:var(--tb-radius-md, 6px);padding:6px 8px"><span style="font-size:9px;color:var(--tb-text-muted, #555)">Browser</span><div style="font-size:12px;color:var(--tb-text-primary, #e0e0e0)">${escapeHtml3(envInfo.browser)} ${escapeHtml3(envInfo.browserVersion)}</div></div>
        <div style="background:var(--tb-bg-primary, #0f0f1a);border-radius:var(--tb-radius-md, 6px);padding:6px 8px"><span style="font-size:9px;color:var(--tb-text-muted, #555)">OS</span><div style="font-size:12px;color:var(--tb-text-primary, #e0e0e0)">${escapeHtml3(envInfo.os)}</div></div>
        <div style="background:var(--tb-bg-primary, #0f0f1a);border-radius:var(--tb-radius-md, 6px);padding:6px 8px"><span style="font-size:9px;color:var(--tb-text-muted, #555)">Viewport</span><div style="font-size:12px;color:var(--tb-text-primary, #e0e0e0)">${escapeHtml3(envInfo.viewport)}</div></div>
        <div style="background:var(--tb-bg-primary, #0f0f1a);border-radius:var(--tb-radius-md, 6px);padding:6px 8px"><span style="font-size:9px;color:var(--tb-text-muted, #555)">Device</span><div style="font-size:12px;color:var(--tb-text-primary, #e0e0e0)">${envInfo.deviceType}</div></div>
      </div>
    </div>`;
    }
    html += `</div>`;
    html += `<div id="bt-tab-timeline" class="bt-tab-content" style="display:none">`;
    html += `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
    <div style="font-size:13px;font-weight:700;color:var(--tb-text-primary, #fff);font-family:var(--tb-font-family, system-ui,sans-serif)">Event Timeline (${s.events.length})</div>
    <span style="font-size:10px;color:var(--tb-text-muted, #555)">${new Date(firstTs).toLocaleTimeString()} \u2014 ${new Date(lastTs).toLocaleTimeString()}</span>
  </div>
  <div style="position:relative;padding-left:24px">
    <div style="position:absolute;left:7px;top:0;bottom:0;width:2px;background:linear-gradient(to bottom, #2a2a3e, #1e1e32)"></div>`;
    for (let i = 0; i < s.events.length; i++) {
      const ev = s.events[i];
      const c = eventConfig[ev.type] || { label: ev.type, icon: "\u{1F4CC}", color: "#666", bg: "#1a1a2e" };
      const isErr = ["error", "unhandled_rejection", "console_error"].includes(ev.type);
      const isApiErr = ev.type === "api_request" && (((_f = ev.data.request) == null ? void 0 : _f.statusCode) >= 400 || ((_g = ev.data.request) == null ? void 0 : _g.statusCode) === 0);
      const isSlowApi = ev.type === "api_request" && ((_h = ev.data.request) == null ? void 0 : _h.durationMs) > 3e3;
      const hasProblem = isErr || isApiErr;
      const dotColor = hasProblem ? "#ef4444" : isSlowApi ? "#f97316" : c.color;
      const timeSincePrev = i > 0 ? ev.timestamp - s.events[i - 1].timestamp : 0;
      if (timeSincePrev > 2e3 && i > 0) {
        html += `<div style="position:relative;margin-bottom:4px;margin-top:4px">
        <div style="position:absolute;left:-21px;top:4px;width:6px;height:6px;border-radius:50%;background:#2a2a3e;border:1px solid #333"></div>
        <div style="font-size:9px;color:var(--tb-text-muted, #444);font-style:italic;padding:2px 0">\u23F1 ${formatDuration(timeSincePrev)} later</div>
      </div>`;
      }
      html += `<div style="position:relative;margin-bottom:6px">
      <div style="position:absolute;left:-21px;top:6px;width:10px;height:10px;border-radius:50%;background:${dotColor};border:2px solid ${dotColor}44;box-shadow:0 0 ${hasProblem ? "6" : "0"}px ${dotColor}44"></div>
      <div style="border:1px solid ${hasProblem ? "#7f1d1d" : isSlowApi ? "#78350f44" : "#1e1e32"};background:${hasProblem ? "#1a0505" : isSlowApi ? "#1a0f05" : "#12121f"};border-radius:var(--tb-radius-md, 8px);padding:10px 12px;transition:border-color 0.2s">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap">
          <span style="font-size:12px">${c.icon}</span>
          <span style="font-size:10px;padding:1px 6px;border-radius:3px;background:${c.bg};color:${c.color};font-weight:600">${c.label}</span>
          <span style="font-size:10px;color:var(--tb-text-muted, #555)">${new Date(ev.timestamp).toLocaleTimeString()}</span>
          <span style="font-size:9px;color:var(--tb-text-muted, #333);margin-left:auto">${ev.page}</span>
        </div>`;
      if (ev.type === "api_request") {
        const r = ev.data.request;
        const code = (r == null ? void 0 : r.statusCode) || 0;
        const dur = (r == null ? void 0 : r.durationMs) || 0;
        const speed = getSpeedLabel(dur);
        const urlPath = ((r == null ? void 0 : r.url) || "").replace(/https?:\/\/[^/]+/, "");
        html += `<div style="margin-top:4px">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
            <span style="font-size:10px;font-weight:700;color:var(--tb-text-primary, #e0e0e0);background:#1e293b;padding:1px 5px;border-radius:3px">${(r == null ? void 0 : r.method) || "GET"}</span>
            <span style="font-size:11px;color:var(--tb-text-secondary, #aaa);word-break:break-all">${escapeHtml3((urlPath == null ? void 0 : urlPath.slice(0, 80)) || "")}</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px;margin-top:6px">
            <div style="display:flex;align-items:center;gap:4px">
              <span style="font-size:11px;font-weight:700;color:${getStatusColor(code)}">${code}</span>
              <span style="font-size:10px;color:${getStatusColor(code)}88">${getStatusLabel(code)}</span>
            </div>
            <span style="color:var(--tb-text-muted, #333)">\xB7</span>
            <div style="display:flex;align-items:center;gap:4px">
              <span style="font-size:10px;color:${speed.color}">${formatDuration(dur)}</span>
              ${dur > 3e3 ? `<span style="font-size:8px;padding:1px 4px;border-radius:2px;background:${speed.color}22;color:${speed.color};border:1px solid ${speed.color}33">${speed.label}</span>` : ""}
            </div>
          </div>
          <div style="height:3px;background:#1e1e32;border-radius:2px;overflow:hidden;margin-top:6px">
            <div style="height:100%;width:${Math.min(100, dur / Math.max(maxApiTime, 1) * 100)}%;background:${speed.color};border-radius:2px;transition:width 0.3s"></div>
          </div>
        </div>`;
      } else if (ev.type === "click") {
        const el = ev.data.element;
        const target = (el == null ? void 0 : el.ariaLabel) || ((_i = el == null ? void 0 : el.text) == null ? void 0 : _i.trim()) || (el == null ? void 0 : el.id) || (el == null ? void 0 : el.tag) || "element";
        html += `<div style="color:var(--tb-text-secondary, #aaa);font-size:11px;line-height:1.4">Clicked "<span style="color:#60a5fa">${escapeHtml3(target.slice(0, 60))}</span>"</div>`;
        const details = [];
        if (el == null ? void 0 : el.tag) details.push(`&lt;${escapeHtml3(el.tag)}&gt;`);
        if (el == null ? void 0 : el.id) details.push(`#${escapeHtml3(el.id)}`);
        if (el == null ? void 0 : el.className) details.push(`.${escapeHtml3(el.className.split(" ")[0])}`);
        if (el == null ? void 0 : el.href) details.push(`\u2192 ${escapeHtml3(el.href.slice(0, 60))}`);
        if (el == null ? void 0 : el.role) details.push(`role="${escapeHtml3(el.role)}"`);
        if (el == null ? void 0 : el.testId) details.push(`data-testid="${escapeHtml3(el.testId)}"`);
        if (details.length > 0) {
          html += `<div style="font-size:9px;color:var(--tb-text-muted, #444);margin-top:3px">${details.join(" ")}</div>`;
        }
      } else if (ev.type === "input") {
        const inp = ev.data.element;
        const fieldName = (inp == null ? void 0 : inp.name) || (inp == null ? void 0 : inp.id) || "field";
        const inputType = (inp == null ? void 0 : inp.type) || "text";
        if (inputType === "checkbox" || inputType === "radio") {
          html += `<div style="color:var(--tb-text-secondary, #aaa);font-size:11px;line-height:1.4">${(inp == null ? void 0 : inp.checked) ? "Checked" : "Unchecked"} "<span style="color:#c084fc">${escapeHtml3(fieldName)}</span>" <span style="font-size:9px;color:var(--tb-text-muted, #555)">(${inputType})</span></div>`;
        } else {
          const val = inp == null ? void 0 : inp.value;
          if (val && val !== "[REDACTED]") {
            html += `<div style="color:var(--tb-text-secondary, #aaa);font-size:11px;line-height:1.4">Typed in "<span style="color:#c084fc">${escapeHtml3(fieldName)}</span>" <span style="font-size:9px;color:var(--tb-text-muted, #555)">(${inputType})</span></div>`;
            html += `<div style="font-size:10px;color:#a78bfa;margin-top:3px;background:#1e153344;padding:3px 8px;border-radius:var(--tb-radius-sm, 4px);border:1px solid #1e1533;word-break:break-word">"${escapeHtml3(val.slice(0, 150))}"</div>`;
          } else {
            html += `<div style="color:var(--tb-text-secondary, #aaa);font-size:11px;line-height:1.4">Typed in "<span style="color:#c084fc">${escapeHtml3(fieldName)}</span>" <span style="font-size:9px;color:var(--tb-text-muted, #555)">(${inputType})</span></div>
            <div style="font-size:9px;color:var(--tb-text-muted, #444);margin-top:2px">${(inp == null ? void 0 : inp.valueLength) || 0} characters ${val === "[REDACTED]" ? '<span style="color:#f87171">\u{1F512} redacted</span>' : ""}</div>`;
          }
        }
        if (inp == null ? void 0 : inp.placeholder) {
          html += `<div style="font-size:9px;color:var(--tb-text-muted, #333);margin-top:2px">placeholder: "${escapeHtml3(inp.placeholder)}"</div>`;
        }
      } else if (ev.type === "select_change") {
        const sel = ev.data.element;
        const fieldName = (sel == null ? void 0 : sel.name) || (sel == null ? void 0 : sel.id) || "dropdown";
        html += `<div style="color:var(--tb-text-secondary, #aaa);font-size:11px;line-height:1.4">Changed "<span style="color:#34d399">${escapeHtml3(fieldName)}</span>" dropdown</div>`;
        html += `<div style="font-size:11px;color:#34d399;margin-top:3px;background:#05201544;padding:4px 8px;border-radius:var(--tb-radius-sm, 4px);border:1px solid #14532d">Selected: "<strong>${escapeHtml3((sel == null ? void 0 : sel.selectedText) || (sel == null ? void 0 : sel.value) || "")}</strong>"</div>`;
        if ((sel == null ? void 0 : sel.allOptions) && sel.allOptions.length > 0) {
          html += `<div style="font-size:9px;color:var(--tb-text-muted, #444);margin-top:3px">Options: ${sel.allOptions.map((o) => escapeHtml3(o)).join(", ")}</div>`;
        }
      } else if (ev.type === "form_submit") {
        const f2 = ev.data.form;
        html += `<div style="color:var(--tb-text-secondary, #aaa);font-size:11px;line-height:1.4">Submitted form ${(f2 == null ? void 0 : f2.id) ? `"<span style="color:#fb923c">${escapeHtml3(f2.id)}</span>"` : ""}</div>`;
        if ((f2 == null ? void 0 : f2.fields) && Object.keys(f2.fields).length > 0) {
          html += `<div style="margin-top:4px;background:#1a150544;padding:6px 8px;border-radius:var(--tb-radius-sm, 4px);border:1px solid var(--tb-border, #2a2a3e)">`;
          for (const [key, val] of Object.entries(f2.fields)) {
            html += `<div style="font-size:10px;margin-bottom:2px"><span style="color:var(--tb-text-muted, #888)">${escapeHtml3(key)}:</span> <span style="color:var(--tb-warning, #fbbf24)">${escapeHtml3(String(val).slice(0, 80))}</span></div>`;
          }
          html += `</div>`;
        }
        if (f2 == null ? void 0 : f2.method) {
          html += `<div style="font-size:9px;color:var(--tb-text-muted, #444);margin-top:2px">${escapeHtml3(String(f2.method).toUpperCase())} ${f2.action ? `\u2192 ${escapeHtml3(f2.action.slice(0, 60))}` : ""}</div>`;
        }
      } else if (ev.type === "route_change") {
        html += `<div style="display:flex;align-items:center;gap:6px;font-size:11px;margin-top:2px">
          <span style="color:var(--tb-text-muted, #888);background:var(--tb-bg-primary, #0f0f1a);padding:2px 6px;border-radius:3px">${escapeHtml3(ev.data.from || "/")}</span>
          <span style="color:#22d3ee">\u2192</span>
          <span style="color:#22d3ee;background:#0c2e3344;padding:2px 6px;border-radius:3px;font-weight:600">${escapeHtml3(ev.data.to || "/")}</span>
        </div>`;
      } else if (ev.type === "error" || ev.type === "unhandled_rejection") {
        const errType = getErrorType(((_j = ev.data.error) == null ? void 0 : _j.message) || "");
        html += `<div style="margin-top:2px">
          <div style="display:flex;align-items:center;gap:4px;margin-bottom:3px">
            <span style="font-size:9px;padding:1px 5px;border-radius:3px;background:${errType.color}22;color:${errType.color};border:1px solid ${errType.color}33">${errType.type}</span>
          </div>
          <div style="color:#fca5a5;font-size:11px;line-height:1.4;word-break:break-word">${escapeHtml3(((_k = ev.data.error) == null ? void 0 : _k.message) || "Unknown error")}</div>
          ${((_l = ev.data.error) == null ? void 0 : _l.source) ? `<div style="font-size:9px;color:var(--tb-text-muted, #555);margin-top:3px">at ${escapeHtml3(ev.data.error.source)}${ev.data.error.line ? `:${ev.data.error.line}` : ""}${ev.data.error.column ? `:${ev.data.error.column}` : ""}</div>` : ""}
        </div>`;
      } else if (ev.type === "console_error") {
        html += `<div style="color:#fb923c;font-size:11px;line-height:1.4;word-break:break-word">${escapeHtml3((((_m = ev.data.error) == null ? void 0 : _m.message) || "").slice(0, 200))}</div>`;
      } else {
        html += `<div style="color:var(--tb-text-secondary, #aaa);font-size:11px;line-height:1.3">${escapeHtml3(describeEvent(ev))}</div>`;
      }
      html += `</div></div>`;
    }
    html += `</div>`;
    html += `</div>`;
    html += `<div id="bt-tab-export" class="bt-tab-content" style="display:none">`;
    html += `<div style="font-size:13px;font-weight:700;color:var(--tb-text-primary, #fff);margin-bottom:14px;font-family:var(--tb-font-family, system-ui,sans-serif)">Export & Share</div>`;
    html += `<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
    <div style="font-size:10px;color:var(--tb-text-muted, #888);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;font-family:var(--tb-font-family, system-ui,sans-serif)">Issue Trackers</div>
    <button id="bt-github-issue" style="${smallBtnStyle("#e0e0e0")}font-size:11px;text-align:left;padding:10px">\u{1F419} Copy GitHub Issue (Markdown)</button>
    <button id="bt-jira-ticket" style="${smallBtnStyle("#2684FF")}font-size:11px;text-align:left;padding:10px">\u{1F3AB} Copy Jira Ticket</button>
  </div>`;
    html += `<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
    <div style="font-size:10px;color:var(--tb-text-muted, #888);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;font-family:var(--tb-font-family, system-ui,sans-serif)">Downloads</div>
    <button id="bt-download-pdf" style="${smallBtnStyle("#f472b6")}font-size:11px;text-align:left;padding:10px">\u{1F4C4} PDF Report</button>
    <button id="bt-download-json" style="${smallBtnStyle("#22d3ee")}font-size:11px;text-align:left;padding:10px">\u2B07 JSON Data</button>
    <button id="bt-download-txt" style="${smallBtnStyle("#a78bfa")}font-size:11px;text-align:left;padding:10px">\u2B07 Text Report</button>
    <button id="bt-download-html" style="${smallBtnStyle("#f472b6")}font-size:11px;text-align:left;padding:10px">\u2B07 HTML Report</button>
  </div>`;
    html += `<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
    <div style="font-size:10px;color:var(--tb-text-muted, #888);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;font-family:var(--tb-font-family, system-ui,sans-serif)">Clipboard</div>
    <button id="bt-copy-report" style="${smallBtnStyle("#3b82f6")}font-size:11px;text-align:left;padding:10px">\u{1F4CB} Copy Full Report (Plain Text)</button>
  </div>`;
    html += `<div style="border-top:1px solid var(--tb-border, #2a2a3e);padding-top:12px;margin-top:8px">
    <button id="bt-delete" style="${smallBtnStyle("#ef4444")}font-size:11px;width:100%;padding:10px">\u{1F5D1} Delete This Session</button>
  </div>`;
    html += `</div>`;
    content2.innerHTML = html;
    const tabs = content2.querySelectorAll(".bt-tab");
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((t) => {
          t.style.cssText = _tabBtnStyle(false);
          t.classList.remove("bt-tab-active");
        });
        tab.style.cssText = _tabBtnStyle(true);
        tab.classList.add("bt-tab-active");
        content2.querySelectorAll(".bt-tab-content").forEach((c) => c.style.display = "none");
        const target = content2.querySelector(`#bt-tab-${tab.dataset.tab}`);
        if (target) target.style.display = "block";
      });
    });
    content2.querySelector("#bt-back").addEventListener("click", () => renderPanel(panel));
    const copyBtn = content2.querySelector("#bt-copy");
    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        const text = `Reproduction Steps:
${s.reproSteps}

Error: ${s.errorMessage}

${s.errorSummary || ""}`;
        navigator.clipboard.writeText(text).then(() => {
          copyBtn.textContent = "\u2713 Copied!";
          setTimeout(() => copyBtn.textContent = "Copy", 2e3);
        });
      });
    }
    content2.querySelector("#bt-download-json").addEventListener("click", () => {
      downloadFile(
        `tracebug-${s.sessionId.slice(0, 8)}.json`,
        JSON.stringify(s, null, 2),
        "application/json"
      );
    });
    content2.querySelector("#bt-download-txt").addEventListener("click", () => {
      const report = buildTextReport(s, problems, apiEvents, sessionDur);
      downloadFile(
        `tracebug-report-${s.sessionId.slice(0, 8)}.txt`,
        report,
        "text/plain"
      );
    });
    content2.querySelector("#bt-download-html").addEventListener("click", () => {
      const htmlReport = buildHtmlReport(s, problems, apiEvents, sessionDur);
      downloadFile(
        `tracebug-report-${s.sessionId.slice(0, 8)}.html`,
        htmlReport,
        "text/html"
      );
    });
    const copyReportBtn = content2.querySelector("#bt-copy-report");
    if (copyReportBtn) {
      copyReportBtn.addEventListener("click", () => {
        const report = buildTextReport(s, problems, apiEvents, sessionDur);
        navigator.clipboard.writeText(report).then(() => {
          copyReportBtn.textContent = "\u2713 Copied!";
          setTimeout(() => copyReportBtn.textContent = "\u{1F4CB} Copy Full Report", 2e3);
        });
      });
    }
    content2.querySelector("#bt-delete").addEventListener("click", () => {
      if (confirm("Delete this session?")) {
        deleteSession(session.sessionId);
        renderPanel(panel);
      }
    });
    const ssBtn = content2.querySelector("#bt-screenshot");
    if (ssBtn) {
      ssBtn.addEventListener("click", async () => {
        ssBtn.textContent = "\u{1F4F8} Capturing...";
        try {
          const lastEvent = s.events[s.events.length - 1] || null;
          const ss = await captureScreenshot(lastEvent);
          ssBtn.textContent = `\u2713 ${ss.filename}`;
          setTimeout(() => {
            ssBtn.textContent = "\u{1F4F8} Screenshot";
          }, 3e3);
          const root = document.getElementById("tracebug-root");
          if (root) showAnnotationEditor(ss, root);
        } catch (e2) {
          ssBtn.textContent = "\u2717 Failed";
          setTimeout(() => {
            ssBtn.textContent = "\u{1F4F8} Screenshot";
          }, 2e3);
        }
      });
    }
    const noteBtn = content2.querySelector("#bt-add-note");
    if (noteBtn) {
      noteBtn.addEventListener("click", () => {
        showNoteDialog(s.sessionId, panel, session);
      });
    }
    const ghBtn = content2.querySelector("#bt-github-issue");
    if (ghBtn) {
      ghBtn.addEventListener("click", () => {
        const report = buildReport(session);
        const md = generateGitHubIssue(report);
        navigator.clipboard.writeText(md).then(() => {
          ghBtn.textContent = "\u2713 Copied!";
          setTimeout(() => {
            ghBtn.textContent = "\u{1F419} GitHub Issue";
          }, 2e3);
          if (report.screenshots.length > 0) {
            downloadAllScreenshots();
          }
        });
      });
    }
    const jiraBtn = content2.querySelector("#bt-jira-ticket");
    if (jiraBtn) {
      jiraBtn.addEventListener("click", () => {
        const report = buildReport(session);
        const ticket = generateJiraTicket(report);
        const text = `Summary: ${ticket.summary}
Priority: ${ticket.priority}
Labels: ${ticket.labels.join(", ")}

${ticket.description}`;
        navigator.clipboard.writeText(text).then(() => {
          jiraBtn.textContent = "\u2713 Copied!";
          setTimeout(() => {
            jiraBtn.textContent = "\u{1F3AB} Jira Ticket";
          }, 2e3);
          if (report.screenshots.length > 0) {
            downloadAllScreenshots();
          }
        });
      });
    }
    const pdfBtn = content2.querySelector("#bt-download-pdf");
    if (pdfBtn) {
      pdfBtn.addEventListener("click", () => {
        const report = buildReport(session);
        generatePdfReport(report);
      });
    }
    const voiceBtn = content2.querySelector("#bt-voice-note");
    if (voiceBtn) {
      voiceBtn.addEventListener("click", () => {
        showVoiceDialog(s.sessionId, panel, session);
      });
    }
  }
  function showNoteDialog(sessionId, panel, session) {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:10;display:flex;align-items:center;justify-content:center;padding:20px";
    overlay.innerHTML = `
    <div style="background:var(--tb-bg-primary, #12121f);border:1px solid var(--tb-border, #2a2a3e);border-radius:var(--tb-radius-lg, 12px);padding:20px;width:100%;max-width:420px">
      <div style="font-size:14px;font-weight:700;color:var(--tb-text-primary, #fff);margin-bottom:12px;font-family:var(--tb-font-family, system-ui,sans-serif)">\u{1F4DD} Add Tester Note</div>
      <div style="margin-bottom:10px">
        <label style="font-size:10px;color:var(--tb-text-muted, #888);display:block;margin-bottom:4px;font-family:var(--tb-font-family, system-ui,sans-serif)">What did you observe?</label>
        <textarea id="bt-note-text" style="width:100%;height:60px;background:var(--tb-bg-primary, #0f0f1a);border:1px solid var(--tb-border, #2a2a3e);border-radius:var(--tb-radius-md, 6px);color:var(--tb-text-primary, #e0e0e0);padding:8px;font-size:12px;font-family:var(--tb-font-family, inherit);resize:vertical" placeholder="Describe the issue..."></textarea>
      </div>
      <div style="margin-bottom:10px">
        <label style="font-size:10px;color:var(--tb-text-muted, #888);display:block;margin-bottom:4px;font-family:var(--tb-font-family, system-ui,sans-serif)">Expected behavior</label>
        <input id="bt-note-expected" style="width:100%;background:var(--tb-bg-primary, #0f0f1a);border:1px solid var(--tb-border, #2a2a3e);border-radius:var(--tb-radius-md, 6px);color:var(--tb-text-primary, #e0e0e0);padding:8px;font-size:12px;font-family:var(--tb-font-family, inherit)" placeholder="What should happen?" />
      </div>
      <div style="margin-bottom:10px">
        <label style="font-size:10px;color:var(--tb-text-muted, #888);display:block;margin-bottom:4px;font-family:var(--tb-font-family, system-ui,sans-serif)">Actual behavior</label>
        <input id="bt-note-actual" style="width:100%;background:var(--tb-bg-primary, #0f0f1a);border:1px solid var(--tb-border, #2a2a3e);border-radius:var(--tb-radius-md, 6px);color:var(--tb-text-primary, #e0e0e0);padding:8px;font-size:12px;font-family:var(--tb-font-family, inherit)" placeholder="What actually happened?" />
      </div>
      <div style="margin-bottom:14px">
        <label style="font-size:10px;color:var(--tb-text-muted, #888);display:block;margin-bottom:4px;font-family:var(--tb-font-family, system-ui,sans-serif)">Severity</label>
        <select id="bt-note-severity" style="width:100%;background:var(--tb-bg-primary, #0f0f1a);border:1px solid var(--tb-border, #2a2a3e);border-radius:var(--tb-radius-md, 6px);color:var(--tb-text-primary, #e0e0e0);padding:8px;font-size:12px;font-family:var(--tb-font-family, inherit)">
          <option value="critical">Critical \u2014 App broken/unusable</option>
          <option value="major">Major \u2014 Feature not working</option>
          <option value="minor" selected>Minor \u2014 Cosmetic/UX issue</option>
          <option value="info">Info \u2014 Observation/Note</option>
        </select>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button id="bt-note-cancel" style="${smallBtnStyle("#666")}font-size:11px">Cancel</button>
        <button id="bt-note-save" style="background:#3b82f6;color:white;border:none;border-radius:var(--tb-radius-md, 6px);padding:8px 16px;cursor:pointer;font-size:12px;font-family:var(--tb-font-family, inherit)">Save Note</button>
      </div>
    </div>
  `;
    const panelEl = panel.querySelector("#bt-content") || panel;
    panelEl.appendChild(overlay);
    overlay.querySelector("#bt-note-cancel").addEventListener("click", () => overlay.remove());
    overlay.querySelector("#bt-note-save").addEventListener("click", () => {
      const text = overlay.querySelector("#bt-note-text").value.trim();
      if (!text) return;
      const annotation = {
        id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
        text,
        expected: overlay.querySelector("#bt-note-expected").value.trim() || void 0,
        actual: overlay.querySelector("#bt-note-actual").value.trim() || void 0,
        severity: overlay.querySelector("#bt-note-severity").value
      };
      addAnnotation(sessionId, annotation);
      overlay.remove();
      const updatedSessions = getAllSessions();
      const updatedSession = updatedSessions.find((s) => s.sessionId === sessionId);
      if (updatedSession) {
        renderSessionDetail(panel, updatedSession);
      }
    });
  }
  function showVoiceDialog(sessionId, panel, session) {
    const overlay = document.createElement("div");
    overlay.id = "bt-voice-overlay";
    overlay.dataset.tracebug = "voice-dialog";
    overlay.style.cssText = "position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:10;display:flex;align-items:center;justify-content:center;padding:20px";
    overlay.innerHTML = `
    <div style="background:var(--tb-bg-primary, #12121f);border:1px solid var(--tb-border, #2a2a3e);border-radius:var(--tb-radius-lg, 12px);padding:20px;width:100%;max-width:420px">
      <div style="font-size:14px;font-weight:700;color:var(--tb-text-primary, #fff);margin-bottom:4px;font-family:var(--tb-font-family, system-ui,sans-serif)">\u{1F3A4} Voice Bug Description</div>
      <div style="font-size:11px;color:var(--tb-text-muted, #666);margin-bottom:14px">Speak to describe the bug. Your words appear below in real-time.</div>
      <div id="bt-voice-status" style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
        <div id="bt-voice-dot" style="width:10px;height:10px;border-radius:50%;background:#666"></div>
        <span id="bt-voice-status-text" style="font-size:11px;color:var(--tb-text-muted, #888)">Click Start to begin recording</span>
      </div>
      <textarea id="bt-voice-transcript" style="width:100%;height:100px;background:var(--tb-bg-primary, #0f0f1a);border:1px solid var(--tb-border, #2a2a3e);border-radius:var(--tb-radius-md, 6px);color:var(--tb-text-primary, #e0e0e0);padding:8px;font-size:12px;font-family:var(--tb-font-family, inherit);resize:vertical" placeholder="Your speech will appear here...&#10;&#10;You can also type or edit the text manually."></textarea>
      <div id="bt-voice-interim" style="font-size:11px;color:#f59e0b88;min-height:20px;margin-top:4px;font-style:italic"></div>
      <div style="display:flex;gap:8px;margin-top:14px">
        <button id="bt-voice-start" style="background:var(--tb-success, #22c55e);color:white;border:none;border-radius:var(--tb-radius-md, 6px);padding:8px 16px;cursor:pointer;font-size:12px;font-family:var(--tb-font-family, inherit);flex:1">\u{1F3A4} Start Recording</button>
        <button id="bt-voice-stop" style="background:var(--tb-error, #ef4444)22;color:var(--tb-error, #ef4444);border:1px solid #ef444444;border-radius:var(--tb-radius-md, 6px);padding:8px 16px;cursor:pointer;font-size:12px;font-family:var(--tb-font-family, inherit);flex:1;display:none">\u23F9 Stop</button>
      </div>
      <div style="display:flex;gap:8px;margin-top:10px;justify-content:flex-end">
        <button id="bt-voice-cancel" style="${smallBtnStyle("#666")}font-size:11px">Cancel</button>
        <button id="bt-voice-save" style="background:#3b82f6;color:white;border:none;border-radius:var(--tb-radius-md, 6px);padding:8px 16px;cursor:pointer;font-size:12px;font-family:var(--tb-font-family, inherit)">Save as Note</button>
      </div>
    </div>
  `;
    const panelEl = panel.querySelector("#bt-content") || panel;
    panelEl.appendChild(overlay);
    const transcriptEl = overlay.querySelector("#bt-voice-transcript");
    const interimEl = overlay.querySelector("#bt-voice-interim");
    const startBtn = overlay.querySelector("#bt-voice-start");
    const stopBtn = overlay.querySelector("#bt-voice-stop");
    const dot = overlay.querySelector("#bt-voice-dot");
    const statusText = overlay.querySelector("#bt-voice-status-text");
    let pulseInterval = null;
    startBtn.addEventListener("click", () => {
      const started = startVoiceRecording({
        onUpdate: (text, interim) => {
          transcriptEl.value = text;
          interimEl.textContent = interim ? `...${interim}` : "";
          transcriptEl.scrollTop = transcriptEl.scrollHeight;
        },
        onStatus: (status, message) => {
          if (status === "recording") {
            dot.style.background = "#22c55e";
            statusText.textContent = "Listening... speak now";
            statusText.style.color = "#22c55e";
            startBtn.style.display = "none";
            stopBtn.style.display = "block";
            pulseInterval = setInterval(() => {
              dot.style.opacity = dot.style.opacity === "0.4" ? "1" : "0.4";
            }, 500);
          } else if (status === "stopped") {
            dot.style.background = "#666";
            statusText.textContent = "Recording stopped";
            statusText.style.color = "#888";
            startBtn.style.display = "block";
            startBtn.textContent = "\u{1F3A4} Record More";
            stopBtn.style.display = "none";
            interimEl.textContent = "";
            if (pulseInterval) {
              clearInterval(pulseInterval);
              pulseInterval = null;
            }
            dot.style.opacity = "1";
          } else if (status === "error") {
            dot.style.background = "#ef4444";
            statusText.textContent = message || "Error occurred";
            statusText.style.color = "#ef4444";
            startBtn.style.display = "block";
            startBtn.textContent = "\u{1F3A4} Try Again";
            stopBtn.style.display = "none";
            if (pulseInterval) {
              clearInterval(pulseInterval);
              pulseInterval = null;
            }
            dot.style.opacity = "1";
          }
        }
      });
      if (!started && !isVoiceSupported()) {
        statusText.textContent = "Speech recognition not supported in this browser.";
        statusText.style.color = "#ef4444";
      }
    });
    stopBtn.addEventListener("click", () => {
      stopVoiceRecording();
    });
    overlay.querySelector("#bt-voice-cancel").addEventListener("click", () => {
      if (isVoiceRecording()) stopVoiceRecording();
      if (pulseInterval) clearInterval(pulseInterval);
      overlay.remove();
    });
    overlay.querySelector("#bt-voice-save").addEventListener("click", () => {
      if (isVoiceRecording()) stopVoiceRecording();
      if (pulseInterval) clearInterval(pulseInterval);
      const text = transcriptEl.value.trim();
      if (!text) {
        statusText.textContent = "No text to save. Record or type something first.";
        statusText.style.color = "#ef4444";
        return;
      }
      const annotation = {
        id: `voice_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
        text: `\u{1F3A4} ${text}`,
        severity: "major"
      };
      addAnnotation(sessionId, annotation);
      overlay.remove();
      const updatedSessions = getAllSessions();
      const updatedSession = updatedSessions.find((s) => s.sessionId === sessionId);
      if (updatedSession) {
        renderSessionDetail(panel, updatedSession);
      }
    });
  }
  function buildTextReport(s, problems, apiEvents, sessionDur) {
    let report = `TraceBug Session Report
${"=".repeat(50)}

`;
    report += `Session ID: ${s.sessionId}
`;
    report += `Date: ${new Date(s.createdAt).toLocaleString()}
`;
    report += `Duration: ${formatDuration(sessionDur)}
`;
    report += `Events: ${s.events.length}

`;
    if (problems.length > 0) {
      report += `Problems Detected (${problems.length})
${"-".repeat(40)}
`;
      for (const p of problems) {
        report += `[${p.severity.toUpperCase()}] ${p.title}
  ${p.detail}

`;
      }
    }
    if (s.errorMessage) {
      report += `Error Details
${"-".repeat(40)}
`;
      report += `Message: ${s.errorMessage}
`;
      if (s.errorStack) report += `Stack:
${s.errorStack}
`;
      report += `
`;
    }
    if (s.reproSteps) {
      report += `Reproduction Steps
${"-".repeat(40)}
${s.reproSteps}

`;
    }
    if (s.errorSummary) {
      report += `Summary
${"-".repeat(40)}
${s.errorSummary}

`;
    }
    report += `Event Timeline
${"-".repeat(40)}
`;
    for (const ev of s.events) {
      const time2 = new Date(ev.timestamp).toLocaleTimeString();
      report += `[${time2}] ${ev.type.toUpperCase()} on ${ev.page}
`;
      report += `  ${describeEventForReport(ev)}
`;
    }
    if (apiEvents.length > 0) {
      report += `
API Calls
${"-".repeat(40)}
`;
      for (const ev of apiEvents) {
        const r = ev.data.request;
        report += `${r == null ? void 0 : r.method} ${r == null ? void 0 : r.url} \u2192 ${r == null ? void 0 : r.statusCode} (${r == null ? void 0 : r.durationMs}ms)
`;
      }
    }
    return report;
  }
  function buildHtmlReport(s, problems, apiEvents, sessionDur) {
    const hasError = !!s.errorMessage;
    let html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TraceBug Report \u2014 ${s.sessionId.slice(0, 8)}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'SF Mono',Consolas,monospace,system-ui,sans-serif;background:var(--tb-bg-primary, #0f0f1a);color:var(--tb-text-primary, #e0e0e0);padding:32px;max-width:800px;margin:0 auto}
  h1{font-size:20px;color:var(--tb-text-primary, #fff);margin-bottom:4px;font-family:var(--tb-font-family, system-ui,sans-serif)}
  h2{font-size:15px;color:var(--tb-text-primary, #fff);margin:24px 0 12px;font-family:var(--tb-font-family, system-ui,sans-serif)}
  .meta{font-size:12px;color:var(--tb-text-muted, #666);margin-bottom:24px}
  .card{background:var(--tb-bg-primary, #12121f);border:1px solid var(--tb-border, #2a2a3e);border-radius:10px;padding:16px;margin-bottom:16px}
  .stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-top:12px}
  .stat{background:var(--tb-bg-primary, #0f0f1a);border-radius:var(--tb-radius-md, 6px);padding:10px;text-align:center}
  .stat-label{font-size:10px;color:var(--tb-text-muted, #555);text-transform:uppercase;letter-spacing:0.5px;font-family:var(--tb-font-family, system-ui,sans-serif)}
  .stat-value{font-size:16px;margin-top:4px}
  .problem{border:1px solid #7f1d1d;background:#1a0505;border-radius:var(--tb-radius-md, 6px);padding:10px;margin-bottom:8px}
  .problem.warning{border-color:#78350f;background:#1a1005}
  .problem.info{border-color:#2a2a3e;background:var(--tb-bg-primary, #12121f)}
  .timeline-event{border:1px solid #1e1e32;background:var(--tb-bg-primary, #12121f);border-radius:var(--tb-radius-md, 8px);padding:12px;margin-bottom:8px;position:relative;margin-left:20px}
  .timeline-event.error{border-color:#7f1d1d;background:#1a0505}
  .timeline-dot{position:absolute;left:-26px;top:14px;width:10px;height:10px;border-radius:50%;border:2px solid}
  .badge{font-size:10px;padding:2px 8px;border-radius:var(--tb-radius-sm, 4px);font-weight:600}
  .tag{font-size:10px;padding:1px 6px;border-radius:3px;font-weight:600}
  pre{white-space:pre-wrap;font-size:12px;line-height:1.5}
  .value-box{background:#1e153344;padding:4px 8px;border-radius:var(--tb-radius-sm, 4px);border:1px solid #1e1533;margin-top:4px;font-size:11px;color:#a78bfa;word-break:break-word}
  .select-box{background:#05201544;padding:4px 8px;border-radius:var(--tb-radius-sm, 4px);border:1px solid #14532d;margin-top:4px;font-size:11px;color:#34d399}
</style></head><body>
<h1>\u{1F41B} TraceBug Session Report</h1>
<div class="meta">Session: ${s.sessionId} \xB7 ${new Date(s.createdAt).toLocaleString()} \xB7 Duration: ${formatDuration(sessionDur)}</div>`;
    html += `<div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <span style="font-size:14px;font-weight:700;font-family:var(--tb-font-family, system-ui,sans-serif)">Session Overview</span>
      <span class="badge" style="background:${hasError ? "#7f1d1d" : "#14532d"};color:${hasError ? "#fca5a5" : "#4ade80"}">${hasError ? "Has Errors" : "Healthy"}</span>
    </div>
    <div class="stat-grid">
      <div class="stat"><div class="stat-label">Duration</div><div class="stat-value">${formatDuration(sessionDur)}</div></div>
      <div class="stat"><div class="stat-label">Events</div><div class="stat-value">${s.events.length}</div></div>
      <div class="stat"><div class="stat-label">Pages</div><div class="stat-value">${new Set(s.events.map((e2) => e2.page)).size}</div></div>
      <div class="stat"><div class="stat-label">API Calls</div><div class="stat-value">${apiEvents.length}</div></div>
    </div>
  </div>`;
    if (problems.length > 0) {
      html += `<h2>\u{1F50D} Problems Detected (${problems.length})</h2>`;
      for (const p of problems) {
        const cls = p.severity === "critical" ? "" : p.severity === "warning" ? " warning" : " info";
        html += `<div class="problem${cls}">
        <div style="margin-bottom:4px"><span style="font-size:14px">${p.icon}</span> <strong style="color:${p.color}">${escapeHtml3(p.title)}</strong></div>
        <div style="color:var(--tb-text-muted, #888);font-size:12px;padding-left:24px">${escapeHtml3(p.detail)}</div>
      </div>`;
      }
    }
    if (s.errorMessage) {
      html += `<h2>\u{1F4A5} Error Details</h2><div class="card" style="border-color:#7f1d1d;background:#1a0505">
      <div style="color:#fca5a5;font-size:13px;line-height:1.5;margin-bottom:8px">${escapeHtml3(s.errorMessage)}</div>
      ${s.errorStack ? `<pre style="color:#dc262690;font-size:11px;background:#0a0a0a;padding:10px;border-radius:var(--tb-radius-md, 6px);max-height:200px;overflow:auto">${escapeHtml3(s.errorStack)}</pre>` : ""}
    </div>`;
    }
    if (s.reproSteps) {
      html += `<h2>\u{1F4CB} Reproduction Steps</h2><div class="card" style="border-color:#14532d;background:#031a09">
      <pre style="color:#bbf7d0;line-height:1.8">${escapeHtml3(s.reproSteps)}</pre>
      ${s.errorSummary ? `<div style="border-top:1px solid #14532d;margin-top:12px;padding-top:10px"><pre style="color:#86efac;font-size:11px">${escapeHtml3(s.errorSummary)}</pre></div>` : ""}
    </div>`;
    }
    html += `<h2>\u{1F4CA} Event Timeline (${s.events.length})</h2>
    <div style="position:relative;padding-left:28px">
    <div style="position:absolute;left:9px;top:0;bottom:0;width:2px;background:linear-gradient(to bottom, #2a2a3e, #1e1e32)"></div>`;
    for (let i = 0; i < s.events.length; i++) {
      const ev = s.events[i];
      const c = eventConfig[ev.type] || { label: ev.type, icon: "\u{1F4CC}", color: "#666", bg: "#1a1a2e" };
      const isErr = ["error", "unhandled_rejection", "console_error"].includes(ev.type);
      const errCls = isErr ? " error" : "";
      const dotColor = isErr ? "#ef4444" : c.color;
      html += `<div class="timeline-event${errCls}">
      <div class="timeline-dot" style="background:${dotColor};border-color:${dotColor}44"></div>
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
        <span style="font-size:13px">${c.icon}</span>
        <span class="tag" style="background:${c.bg};color:${c.color}">${c.label}</span>
        <span style="font-size:10px;color:var(--tb-text-muted, #555)">${new Date(ev.timestamp).toLocaleTimeString()}</span>
        <span style="font-size:10px;color:var(--tb-text-muted, #333);margin-left:auto">${ev.page}</span>
      </div>
      <div style="font-size:12px;color:var(--tb-text-secondary, #aaa)">${describeEventHtml(ev)}</div>
    </div>`;
    }
    html += `</div>
<div style="text-align:center;color:var(--tb-text-muted, #333);font-size:11px;margin-top:32px;padding:16px;border-top:1px solid #1e1e32">Generated by TraceBug AI \xB7 ${(/* @__PURE__ */ new Date()).toLocaleString()}</div>
</body></html>`;
    return html;
  }
  function describeEventHtml(ev) {
    var _a, _b, _c;
    switch (ev.type) {
      case "click": {
        const el = ev.data.element;
        const target = (el == null ? void 0 : el.ariaLabel) || ((_a = el == null ? void 0 : el.text) == null ? void 0 : _a.trim()) || (el == null ? void 0 : el.id) || (el == null ? void 0 : el.tag) || "element";
        let s = `Clicked "<span style="color:#60a5fa">${escapeHtml3(target.slice(0, 60))}</span>"`;
        if (el == null ? void 0 : el.href) s += ` <span style="font-size:10px;color:var(--tb-text-muted, #444)">\u2192 ${escapeHtml3(el.href.slice(0, 60))}</span>`;
        return s;
      }
      case "input": {
        const inp = ev.data.element;
        const val = inp == null ? void 0 : inp.value;
        let s = `Typed in "<span style="color:#c084fc">${escapeHtml3((inp == null ? void 0 : inp.name) || "field")}</span>"`;
        if (val && val !== "[REDACTED]") s += `<div class="value-box">"${escapeHtml3(val.slice(0, 150))}"</div>`;
        else if (val === "[REDACTED]") s += ` <span style="color:#f87171;font-size:10px">\u{1F512} redacted</span>`;
        return s;
      }
      case "select_change": {
        const sel = ev.data.element;
        let s = `Changed "<span style="color:#34d399">${escapeHtml3((sel == null ? void 0 : sel.name) || "dropdown")}</span>"`;
        s += `<div class="select-box">Selected: "<strong>${escapeHtml3((sel == null ? void 0 : sel.selectedText) || (sel == null ? void 0 : sel.value) || "")}</strong>"</div>`;
        return s;
      }
      case "form_submit": {
        const f2 = ev.data.form;
        let s = `Submitted form ${(f2 == null ? void 0 : f2.id) ? `"${escapeHtml3(f2.id)}"` : ""}`;
        if (f2 == null ? void 0 : f2.fields) {
          s += `<div style="margin-top:4px">`;
          for (const [key, val] of Object.entries(f2.fields)) {
            s += `<div style="font-size:10px"><span style="color:var(--tb-text-muted, #888)">${escapeHtml3(key)}:</span> ${escapeHtml3(String(val).slice(0, 80))}</div>`;
          }
          s += `</div>`;
        }
        return s;
      }
      case "route_change":
        return `<span style="color:var(--tb-text-muted, #888)">${escapeHtml3(ev.data.from || "/")}</span> <span style="color:#22d3ee">\u2192</span> <span style="color:#22d3ee;font-weight:600">${escapeHtml3(ev.data.to || "/")}</span>`;
      case "api_request": {
        const r = ev.data.request;
        return `<span style="font-weight:600">${escapeHtml3((r == null ? void 0 : r.method) || "")}</span> ${escapeHtml3(((r == null ? void 0 : r.url) || "").slice(0, 80))} \u2192 <span style="color:${getStatusColor((r == null ? void 0 : r.statusCode) || 0)};font-weight:700">${r == null ? void 0 : r.statusCode}</span> <span style="color:var(--tb-text-muted, #555)">(${r == null ? void 0 : r.durationMs}ms)</span>`;
      }
      case "error":
      case "unhandled_rejection":
        return `<span style="color:#fca5a5">${escapeHtml3(((_b = ev.data.error) == null ? void 0 : _b.message) || "Unknown error")}</span>`;
      case "console_error":
        return `<span style="color:#fb923c">${escapeHtml3((((_c = ev.data.error) == null ? void 0 : _c.message) || "").slice(0, 200))}</span>`;
      default:
        return escapeHtml3(JSON.stringify(ev.data).slice(0, 100));
    }
  }
  function describeEventForReport(ev) {
    var _a, _b, _c, _d;
    switch (ev.type) {
      case "click": {
        const el = ev.data.element;
        const target = (el == null ? void 0 : el.ariaLabel) || ((_a = el == null ? void 0 : el.text) == null ? void 0 : _a.trim()) || (el == null ? void 0 : el.id) || (el == null ? void 0 : el.tag) || "element";
        let s = `Clicked "${target}"`;
        if (el == null ? void 0 : el.href) s += ` \u2192 ${el.href}`;
        return s;
      }
      case "input": {
        const inp = ev.data.element;
        const val = inp == null ? void 0 : inp.value;
        if (val && val !== "[REDACTED]") return `Typed "${val}" in "${(inp == null ? void 0 : inp.name) || "field"}" (${(inp == null ? void 0 : inp.type) || "text"})`;
        return `Typed in "${(inp == null ? void 0 : inp.name) || "field"}" (${(inp == null ? void 0 : inp.valueLength) || 0} chars, ${(inp == null ? void 0 : inp.type) || "text"})`;
      }
      case "select_change": {
        const sel = ev.data.element;
        return `Selected "${(sel == null ? void 0 : sel.selectedText) || (sel == null ? void 0 : sel.value)}" from "${(sel == null ? void 0 : sel.name) || "dropdown"}" dropdown`;
      }
      case "form_submit": {
        const f2 = ev.data.form;
        let s = `Submitted form "${(f2 == null ? void 0 : f2.id) || ""}" (${f2 == null ? void 0 : f2.fieldCount} fields)`;
        if (f2 == null ? void 0 : f2.fields) {
          const entries = Object.entries(f2.fields);
          if (entries.length > 0) s += ` \u2014 ` + entries.map(([k, v]) => `${k}="${String(v).slice(0, 40)}"`).join(", ");
        }
        return s;
      }
      case "route_change":
        return `${ev.data.from || "/"} \u2192 ${ev.data.to || "/"}`;
      case "api_request": {
        const r = ev.data.request;
        return `${r == null ? void 0 : r.method} ${(_b = r == null ? void 0 : r.url) == null ? void 0 : _b.slice(0, 80)} \u2192 ${r == null ? void 0 : r.statusCode} (${r == null ? void 0 : r.durationMs}ms)`;
      }
      case "error":
      case "unhandled_rejection":
        return ((_c = ev.data.error) == null ? void 0 : _c.message) || "Unknown error";
      case "console_error":
        return (((_d = ev.data.error) == null ? void 0 : _d.message) || "").slice(0, 120);
      default:
        return JSON.stringify(ev.data).slice(0, 100);
    }
  }
  function downloadFile(filename, content2, mimeType) {
    const blob = new Blob([content2], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a2 = document.createElement("a");
    a2.href = url;
    a2.download = filename;
    document.body.appendChild(a2);
    a2.click();
    document.body.removeChild(a2);
    URL.revokeObjectURL(url);
  }
  var eventConfig = {
    click: { label: "Click", icon: "\u{1F446}", color: "#60a5fa", bg: "#1e293b" },
    input: { label: "Input", icon: "\u2328\uFE0F", color: "#c084fc", bg: "#1e1533" },
    select_change: { label: "Select", icon: "\u{1F4CB}", color: "#34d399", bg: "#052015" },
    form_submit: { label: "Form Submit", icon: "\u{1F4E4}", color: "#fb923c", bg: "#2a1505" },
    route_change: { label: "Navigate", icon: "\u{1F500}", color: "#22d3ee", bg: "#0c2e33" },
    api_request: { label: "API", icon: "\u{1F310}", color: "#fbbf24", bg: "#2a2005" },
    error: { label: "Error", icon: "\u{1F4A5}", color: "#f87171", bg: "#2a0505" },
    console_error: { label: "Console Err", icon: "\u26A0\uFE0F", color: "#fb923c", bg: "#2a1505" },
    unhandled_rejection: { label: "Rejection", icon: "\u{1F4A5}", color: "#f87171", bg: "#2a0505" }
  };
  function getStatusColor(code) {
    if (code === 0) return "#ef4444";
    if (code < 300) return "#22c55e";
    if (code < 400) return "#fbbf24";
    if (code < 500) return "#f97316";
    return "#ef4444";
  }
  function getStatusLabel(code) {
    if (code === 0) return "Network Error";
    const labels = {
      200: "OK",
      201: "Created",
      204: "No Content",
      301: "Moved",
      302: "Found",
      304: "Not Modified",
      400: "Bad Request",
      401: "Unauthorized",
      403: "Forbidden",
      404: "Not Found",
      405: "Method Not Allowed",
      408: "Timeout",
      409: "Conflict",
      413: "Payload Too Large",
      422: "Unprocessable",
      429: "Rate Limited",
      500: "Internal Server Error",
      502: "Bad Gateway",
      503: "Service Unavailable",
      504: "Gateway Timeout"
    };
    return labels[code] || (code < 300 ? "Success" : code < 400 ? "Redirect" : code < 500 ? "Client Error" : "Server Error");
  }
  function getSpeedLabel(ms) {
    if (ms < 200) return { label: "Fast", color: "#22c55e" };
    if (ms < 1e3) return { label: "Normal", color: "#fbbf24" };
    if (ms < 5e3) return { label: "Slow", color: "#f97316" };
    return { label: "Very Slow", color: "#ef4444" };
  }
  function getErrorType(msg) {
    const m = msg.toLowerCase();
    if (m.includes("typeerror") || m.includes("cannot read prop")) return { type: "TypeError", color: "#f87171" };
    if (m.includes("referenceerror")) return { type: "ReferenceError", color: "#fb923c" };
    if (m.includes("syntaxerror")) return { type: "SyntaxError", color: "#f472b6" };
    if (m.includes("rangeerror")) return { type: "RangeError", color: "#c084fc" };
    if (m.includes("networkerror") || m.includes("fetch") || m.includes("network")) return { type: "NetworkError", color: "#fbbf24" };
    if (m.includes("timeout")) return { type: "TimeoutError", color: "#f97316" };
    if (m.includes("chunk") || m.includes("loading")) return { type: "ChunkLoadError", color: "#fb923c" };
    return { type: "RuntimeError", color: "#f87171" };
  }
  function formatDuration(ms) {
    if (ms < 1e3) return `${ms}ms`;
    if (ms < 6e4) return `${(ms / 1e3).toFixed(1)}s`;
    return `${Math.floor(ms / 6e4)}m ${Math.floor(ms % 6e4 / 1e3)}s`;
  }
  function describeEvent(event) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s;
    const d = event.data;
    switch (event.type) {
      case "click":
        return `Clicked "${((_a = d.element) == null ? void 0 : _a.text) || ((_b = d.element) == null ? void 0 : _b.id) || ((_c = d.element) == null ? void 0 : _c.tag) || "element"}"`;
      case "input": {
        const val = (_d = d.element) == null ? void 0 : _d.value;
        if (val && val !== "[REDACTED]") return `Typed "${val.slice(0, 40)}" in "${((_e = d.element) == null ? void 0 : _e.name) || "field"}"`;
        return `Typed in "${((_f = d.element) == null ? void 0 : _f.name) || "field"}" (${((_g = d.element) == null ? void 0 : _g.valueLength) || 0} chars)`;
      }
      case "select_change":
        return `Selected "${((_h = d.element) == null ? void 0 : _h.selectedText) || ((_i = d.element) == null ? void 0 : _i.value)}" from "${((_j = d.element) == null ? void 0 : _j.name) || "dropdown"}"`;
      case "form_submit":
        return `Submitted form "${((_k = d.form) == null ? void 0 : _k.id) || ""}" (${((_l = d.form) == null ? void 0 : _l.fieldCount) || 0} fields)`;
      case "route_change":
        return `${d.from} \u2192 ${d.to}`;
      case "api_request":
        return `${(_m = d.request) == null ? void 0 : _m.method} ${(_o = (_n = d.request) == null ? void 0 : _n.url) == null ? void 0 : _o.slice(0, 60)} \u2192 ${(_p = d.request) == null ? void 0 : _p.statusCode} (${(_q = d.request) == null ? void 0 : _q.durationMs}ms)`;
      case "error":
      case "unhandled_rejection":
        return ((_r = d.error) == null ? void 0 : _r.message) || "Unknown error";
      case "console_error":
        return (((_s = d.error) == null ? void 0 : _s.message) || "").slice(0, 120);
      default:
        return JSON.stringify(d).slice(0, 100);
    }
  }
  function timeAgo(ts) {
    const diff = Math.floor((Date.now() - ts) / 1e3);
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }
  function escapeHtml3(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function smallBtnStyle(color2) {
    return `background:${color2}22;color:${color2};border:1px solid ${color2}44;border-radius:var(--tb-radius-sm, 4px);padding:4px 10px;cursor:pointer;font-size:11px;font-family:var(--tb-font-family, inherit);`;
  }
  function _tabBtnStyle(active) {
    return active ? `background:transparent;border:none;border-bottom:2px solid var(--tb-accent, #7B61FF);color:var(--tb-text-primary, #fff);padding:8px 14px;font-size:12px;font-weight:600;cursor:pointer;font-family:var(--tb-font-family, system-ui,sans-serif);white-space:nowrap;` : `background:transparent;border:none;border-bottom:2px solid transparent;color:var(--tb-text-muted, #666);padding:8px 14px;font-size:12px;font-weight:500;cursor:pointer;font-family:var(--tb-font-family, system-ui,sans-serif);white-space:nowrap;`;
  }
  function renderAnnotationList(panel) {
    var _a, _b, _c, _d;
    const elAnnotations = getElementAnnotations();
    const drawRegions = getDrawRegions();
    const screenshotsList = getScreenshots();
    const total = elAnnotations.length + drawRegions.length + screenshotsList.length;
    panel.innerHTML = `
    <div style="padding:16px 20px;border-bottom:1px solid var(--tb-border, #2a2a3e);display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
      <div>
        <div style="font-size:16px;font-weight:700;color:var(--tb-text-primary, #fff);font-family:system-ui,-apple-system,sans-serif">Page Annotations</div>
        <div style="font-size:11px;color:var(--tb-text-muted, #666);margin-top:3px">${elAnnotations.length} element${elAnnotations.length !== 1 ? "s" : ""}, ${drawRegions.length} region${drawRegions.length !== 1 ? "s" : ""}, ${screenshotsList.length} screenshot${screenshotsList.length !== 1 ? "s" : ""}</div>
      </div>
      <div style="display:flex;gap:6px">
        ${total > 0 ? `
          <button id="bt-ann-screenshot" style="${smallBtnStyle("#22c55e")}font-size:10px" title="Screenshot page with annotations visible">\u{1F4F8} Save</button>
          <button id="bt-ann-export-md" style="${smallBtnStyle("#a78bfa")}font-size:10px" title="Copy all annotations as Markdown">Copy MD</button>
          <button id="bt-ann-export-json" style="${smallBtnStyle("#22d3ee")}font-size:10px" title="Copy all annotations as JSON">Copy JSON</button>
          <button id="bt-ann-clear-all" style="${smallBtnStyle("#ef4444")}font-size:10px" title="Remove all annotations">Clear All</button>
        ` : ""}
      </div>
    </div>
    <div id="bt-ann-list-content" style="flex:1;overflow-y:auto;padding:12px 16px"></div>
  `;
    const content2 = panel.querySelector("#bt-ann-list-content");
    if (total > 0) {
      (_a = panel.querySelector("#bt-ann-screenshot")) == null ? void 0 : _a.addEventListener("click", async () => {
        const btn = panel.querySelector("#bt-ann-screenshot");
        btn.textContent = "Capturing...";
        try {
          const ss = await captureScreenshot(null, { includeAnnotations: true });
          downloadScreenshot(ss.dataUrl, ss.filename);
          const root = document.getElementById("tracebug-root");
          if (root) showToast2(`Saved: ${ss.filename}`, root);
          btn.textContent = "\u{1F4F8} Save";
        } catch (e2) {
          btn.textContent = "Failed";
          setTimeout(() => {
            btn.textContent = "\u{1F4F8} Save";
          }, 2e3);
        }
      });
      (_b = panel.querySelector("#bt-ann-export-md")) == null ? void 0 : _b.addEventListener("click", async () => {
        const ok = await copyToClipboard("markdown");
        const btn = panel.querySelector("#bt-ann-export-md");
        if (ok) {
          btn.textContent = "Copied!";
          btn.style.background = "#22c55e33";
          btn.style.color = "#22c55e";
          btn.style.borderColor = "#22c55e44";
        } else {
          btn.textContent = "Failed";
        }
        setTimeout(() => {
          btn.textContent = "Copy MD";
          btn.style.cssText = `${smallBtnStyle("#a78bfa")}font-size:10px`;
        }, 2e3);
      });
      (_c = panel.querySelector("#bt-ann-export-json")) == null ? void 0 : _c.addEventListener("click", async () => {
        const ok = await copyToClipboard("json");
        const btn = panel.querySelector("#bt-ann-export-json");
        if (ok) {
          btn.textContent = "Copied!";
          btn.style.background = "#22c55e33";
          btn.style.color = "#22c55e";
          btn.style.borderColor = "#22c55e44";
        } else {
          btn.textContent = "Failed";
        }
        setTimeout(() => {
          btn.textContent = "Copy JSON";
          btn.style.cssText = `${smallBtnStyle("#22d3ee")}font-size:10px`;
        }, 2e3);
      });
      (_d = panel.querySelector("#bt-ann-clear-all")) == null ? void 0 : _d.addEventListener("click", () => {
        if (confirm("Remove all annotations? This cannot be undone.")) {
          clearAllAnnotations();
          clearAnnotationBadges();
          renderAnnotationList(panel);
        }
      });
    }
    if (total === 0) {
      content2.innerHTML = `
      <div style="text-align:center;padding:48px 24px;color:var(--tb-text-muted, #666)">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="1.5" style="margin-bottom:16px;opacity:0.5">
          <circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke-linecap="round"/>
          <rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="4 3"/>
        </svg>
        <div style="font-family:var(--tb-font-family, system-ui,sans-serif);font-size:14px;font-weight:600;color:var(--tb-text-muted, #888);margin-bottom:6px">Ready to annotate</div>
        <div style="font-size:12px;line-height:1.5;color:var(--tb-text-muted, #555);max-width:260px;margin:0 auto">
          Use <strong style="color:#7B61FF">Annotate</strong> to click elements or <strong style="color:#7B61FF">Draw</strong> to mark regions on the page.
        </div>
        <div style="font-size:11px;color:var(--tb-text-muted, #444);margin-top:12px">
          Keyboard: <span style="background:#1e1e32;padding:2px 6px;border-radius:3px;font-family:monospace">Ctrl+Shift+A</span>
          <span style="background:#1e1e32;padding:2px 6px;border-radius:3px;font-family:monospace;margin-left:4px">Ctrl+Shift+D</span>
        </div>
      </div>
    `;
      return;
    }
    let html = "";
    if (elAnnotations.length > 0) {
      html += `<div style="font-size:11px;color:#7B61FF;font-weight:700;margin-bottom:10px;font-family:var(--tb-font-family, system-ui,sans-serif);display:flex;align-items:center;gap:6px;border-left:3px solid #7B61FF;padding-left:8px">ELEMENT ANNOTATIONS (${elAnnotations.length})</div>`;
      for (let i = 0; i < elAnnotations.length; i++) {
        const a2 = elAnnotations[i];
        const intentColor = _getIntentColor(a2.intent);
        const sevColor = a2.severity === "critical" ? "#ef4444" : a2.severity === "major" ? "#f97316" : a2.severity === "minor" ? "#3b82f6" : "#888";
        const ago = timeAgo(a2.timestamp);
        html += `<div style="border:1px solid var(--tb-border, #2a2a3e);border-radius:10px;padding:12px;margin-bottom:8px;background:var(--tb-bg-primary, #12121f);transition:border-color 0.2s" onmouseenter="this.style.borderColor='#3a3a5e'" onmouseleave="this.style.borderColor='#2a2a3e'">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
          <span style="width:22px;height:22px;border-radius:50%;background:${intentColor};color:var(--tb-text-primary, #fff);font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${i + 1}</span>
          <span style="font-size:10px;padding:2px 8px;border-radius:var(--tb-radius-sm, 4px);background:${intentColor}22;color:${intentColor};border:1px solid ${intentColor}44;font-weight:600;text-transform:uppercase">${a2.intent}</span>
          <span style="font-size:10px;padding:2px 8px;border-radius:var(--tb-radius-sm, 4px);background:${sevColor}15;color:${sevColor};font-weight:500">${a2.severity}</span>
          <span style="font-size:10px;color:var(--tb-text-muted, #555);margin-left:auto">${ago}</span>
          <button class="bt-ann-delete" data-id="${a2.id}" style="background:var(--tb-error, #ef4444)15;border:1px solid #ef444433;color:var(--tb-error, #ef4444);cursor:pointer;font-size:11px;padding:3px 8px;border-radius:var(--tb-radius-sm, 4px);font-family:var(--tb-font-family, inherit)" title="Delete this annotation">Delete</button>
        </div>
        <div style="font-size:11px;color:#777;margin-bottom:6px">
          <span style="background:#1e1e32;padding:1px 6px;border-radius:3px;font-family:monospace;font-size:10px">&lt;${escapeHtml3(a2.tagName)}&gt;</span>
          ${a2.innerText ? `<span style="color:#999;margin-left:4px">"${escapeHtml3(a2.innerText.slice(0, 40))}"</span>` : ""}
        </div>
        <div style="font-size:12px;color:var(--tb-text-primary, #e0e0e0);line-height:1.5">${escapeHtml3(a2.comment)}</div>
      </div>`;
      }
    }
    if (drawRegions.length > 0) {
      html += `<div style="font-size:11px;color:#00E5FF;font-weight:700;margin-top:14px;margin-bottom:10px;font-family:var(--tb-font-family, system-ui,sans-serif);display:flex;align-items:center;gap:6px;border-left:3px solid #00E5FF;padding-left:8px">DRAW REGIONS (${drawRegions.length})</div>`;
      for (let i = 0; i < drawRegions.length; i++) {
        const r = drawRegions[i];
        const shapeLabel = r.shape === "rect" ? "Rectangle" : "Ellipse";
        const ago = timeAgo(r.timestamp);
        html += `<div style="border:1px solid var(--tb-border, #2a2a3e);border-radius:10px;padding:12px;margin-bottom:8px;background:var(--tb-bg-primary, #12121f);transition:border-color 0.2s" onmouseenter="this.style.borderColor='#3a3a5e'" onmouseleave="this.style.borderColor='#2a2a3e'">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
          <span style="width:22px;height:22px;border-radius:${r.shape === "ellipse" ? "50%" : "5px"};background:${r.color}33;border:2px solid ${r.color};display:flex;align-items:center;justify-content:center;flex-shrink:0"></span>
          <span style="font-size:12px;color:var(--tb-text-primary, #e0e0e0);font-weight:600">${shapeLabel}</span>
          <span style="font-size:10px;color:var(--tb-text-muted, #555)">${Math.round(r.width)} x ${Math.round(r.height)}</span>
          <span style="font-size:10px;color:var(--tb-text-muted, #555);margin-left:auto">${ago}</span>
          <button class="bt-ann-delete" data-id="${r.id}" style="background:var(--tb-error, #ef4444)15;border:1px solid #ef444433;color:var(--tb-error, #ef4444);cursor:pointer;font-size:11px;padding:3px 8px;border-radius:var(--tb-radius-sm, 4px);font-family:var(--tb-font-family, inherit)" title="Delete this region">Delete</button>
        </div>
        <div style="font-size:12px;color:var(--tb-text-primary, #e0e0e0);line-height:1.5">${r.comment ? escapeHtml3(r.comment) : '<span style="color:var(--tb-text-muted, #555);font-style:italic">No comment added</span>'}</div>
      </div>`;
      }
    }
    if (screenshotsList.length > 0) {
      html += `<div style="font-size:11px;color:#22d3ee;font-weight:700;margin-top:14px;margin-bottom:10px;font-family:var(--tb-font-family, system-ui,sans-serif);display:flex;align-items:center;gap:6px;border-left:3px solid #22d3ee;padding-left:8px">SCREENSHOTS (${screenshotsList.length})</div>`;
      for (const ss of screenshotsList) {
        html += `<div style="border:1px solid var(--tb-border, #2a2a3e);border-radius:10px;padding:10px;margin-bottom:8px;background:var(--tb-bg-primary, #12121f)">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
          <span style="font-size:12px;color:var(--tb-text-primary, #e0e0e0);font-weight:600">${escapeHtml3(ss.filename)}</span>
          <span style="font-size:10px;color:var(--tb-text-muted, #555);margin-left:auto">${ss.width}x${ss.height}</span>
          <button class="bt-ss-download" data-id="${ss.id}" style="${smallBtnStyle("#22d3ee")}font-size:10px;padding:2px 8px" title="Download">Download</button>
        </div>
        <img src="${ss.dataUrl}" style="max-width:100%;border-radius:var(--tb-radius-md, 6px);border:1px solid var(--tb-border, #2a2a3e)" alt="${escapeHtml3(ss.filename)}" />
      </div>`;
      }
    }
    content2.innerHTML = html;
    content2.querySelectorAll(".bt-ss-download").forEach((btn) => {
      btn.addEventListener("click", (e2) => {
        e2.stopPropagation();
        const id = btn.dataset.id || "";
        const ss = screenshotsList.find((s) => s.id === id);
        if (ss) downloadScreenshot(ss.dataUrl, ss.filename);
      });
    });
    content2.querySelectorAll(".bt-ann-delete").forEach((btn) => {
      btn.addEventListener("click", (e2) => {
        e2.stopPropagation();
        const id = btn.dataset.id || "";
        removeAnnotationById(id);
        const root = document.getElementById("tracebug-root");
        if (root) showAnnotationBadges(root);
        renderAnnotationList(panel);
      });
    });
  }
  function _getIntentColor(intent) {
    switch (intent) {
      case "fix":
        return "#ef4444";
      case "redesign":
        return "#7B61FF";
      case "remove":
        return "#f97316";
      case "question":
        return "#3b82f6";
      default:
        return "#888";
    }
  }
  function showToast2(message, root) {
    const existing = root.querySelector(".bt-toast");
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.className = "bt-toast";
    toast.dataset.tracebug = "toast";
    toast.style.cssText = `
    position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
    background:var(--tb-bg-secondary, #1a1a2e)ee;color:var(--tb-text-primary, #e0e0e0);border:1px solid var(--tb-border-hover, #3a3a5e);
    border-radius:10px;padding:10px 20px;font-size:13px;
    font-family:system-ui,-apple-system,sans-serif;z-index:2147483647;
    box-shadow:0 8px 32px rgba(0,0,0,0.4);pointer-events:auto;
    max-width:420px;text-align:center;line-height:1.4;
    animation:tracebug-toast-in 0.2s ease;
  `;
    if (!document.getElementById("tracebug-toast-anim")) {
      const style = document.createElement("style");
      style.id = "tracebug-toast-anim";
      style.textContent = `
      @keyframes tracebug-toast-in { from { opacity:0; transform:translateX(-50%) translateY(8px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
    `;
      document.head.appendChild(style);
    }
    toast.textContent = message;
    toast.setAttribute("role", "status");
    root.appendChild(toast);
    const liveRegion = document.getElementById("tracebug-live");
    if (liveRegion) liveRegion.textContent = message;
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(-50%) translateY(8px)";
      toast.style.transition = "all 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, 2e3);
  }
  function showAnnotationEditor(screenshot, root) {
    const overlay = document.createElement("div");
    overlay.id = "bt-annotation-overlay";
    overlay.style.cssText = `
    position:fixed;top:0;left:0;right:0;bottom:0;
    background:rgba(0,0,0,0.85);z-index:2147483647;
    display:flex;flex-direction:column;align-items:center;
    justify-content:center;pointer-events:auto;
    font-family:var(--tb-font-family, system-ui,sans-serif);
  `;
    const maxW = window.innerWidth * 0.85;
    const maxH = window.innerHeight * 0.78;
    const imgRatio = screenshot.width / screenshot.height;
    let displayW = screenshot.width;
    let displayH = screenshot.height;
    if (displayW > maxW) {
      displayW = maxW;
      displayH = displayW / imgRatio;
    }
    if (displayH > maxH) {
      displayH = maxH;
      displayW = displayH * imgRatio;
    }
    displayW = Math.round(displayW);
    displayH = Math.round(displayH);
    const toolbarHtml = `
    <div style="display:flex;gap:8px;margin-bottom:10px;align-items:center">
      <span style="color:var(--tb-text-muted, #888);font-size:11px;margin-right:8px">ANNOTATE:</span>
      <button class="bt-ann-tool" data-tool="rect" style="${annToolBtnStyle(true)}">\u25AD Highlight</button>
      <button class="bt-ann-tool" data-tool="arrow" style="${annToolBtnStyle(false)}">\u2192 Arrow</button>
      <button class="bt-ann-tool" data-tool="text" style="${annToolBtnStyle(false)}">T Text</button>
      <span style="color:var(--tb-text-muted, #333);margin:0 4px">|</span>
      <button class="bt-ann-tool" data-tool="color-red" style="background:var(--tb-error, #ef4444);border:2px solid #ef4444;width:22px;height:22px;border-radius:50%;cursor:pointer;padding:0"></button>
      <button class="bt-ann-tool" data-tool="color-yellow" style="background:#eab308;border:2px solid #eab308;width:22px;height:22px;border-radius:50%;cursor:pointer;padding:0"></button>
      <button class="bt-ann-tool" data-tool="color-green" style="background:var(--tb-success, #22c55e);border:2px solid #22c55e;width:22px;height:22px;border-radius:50%;cursor:pointer;padding:0"></button>
      <button class="bt-ann-tool" data-tool="color-blue" style="background:#3b82f6;border:2px solid #3b82f6;width:22px;height:22px;border-radius:50%;cursor:pointer;padding:0"></button>
      <span style="color:var(--tb-text-muted, #333);margin:0 4px">|</span>
      <button id="bt-ann-undo" style="${annActionBtnStyle()}">\u21A9 Undo</button>
      <button id="bt-ann-clear" style="${annActionBtnStyle()}">\u2715 Clear</button>
      <div style="flex:1"></div>
      <span style="color:var(--tb-text-muted, #555);font-size:10px">Ctrl+Shift+S</span>
    </div>
  `;
    const actionsHtml = `
    <div style="display:flex;gap:10px;margin-top:10px;align-items:center">
      <button id="bt-ann-save" style="background:#3b82f6;color:white;border:none;border-radius:var(--tb-radius-md, 6px);padding:8px 20px;cursor:pointer;font-size:13px;font-family:var(--tb-font-family, inherit)">\u2713 Save Annotated</button>
      <button id="bt-ann-download" style="background:var(--tb-success, #22c55e)22;color:var(--tb-success, #22c55e);border:1px solid #22c55e44;border-radius:var(--tb-radius-md, 6px);padding:8px 16px;cursor:pointer;font-size:12px;font-family:var(--tb-font-family, inherit)">\u2193 Download</button>
      <button id="bt-ann-cancel" style="background:#66666622;color:var(--tb-text-muted, #888);border:1px solid #66666644;border-radius:var(--tb-radius-md, 6px);padding:8px 16px;cursor:pointer;font-size:12px;font-family:var(--tb-font-family, inherit)">Cancel</button>
      <div style="flex:1"></div>
      <span style="color:var(--tb-text-muted, #555);font-size:10px">${screenshot.filename}</span>
    </div>
  `;
    overlay.innerHTML = `${toolbarHtml}<div id="bt-ann-canvas-wrap" style="position:relative;cursor:crosshair"></div>${actionsHtml}`;
    root.appendChild(overlay);
    const canvasWrap = overlay.querySelector("#bt-ann-canvas-wrap");
    const img = new Image();
    img.onload = () => {
      img.style.cssText = `width:${displayW}px;height:${displayH}px;border-radius:var(--tb-radius-md, 6px);display:block;user-select:none;pointer-events:none`;
      canvasWrap.appendChild(img);
      const canvas = document.createElement("canvas");
      canvas.width = displayW;
      canvas.height = displayH;
      canvas.dataset.tracebug = "annotation-canvas";
      canvas.style.cssText = `position:absolute;top:0;left:0;width:${displayW}px;height:${displayH}px;border-radius:var(--tb-radius-md, 6px);`;
      canvasWrap.appendChild(canvas);
      initAnnotationCanvas(canvas, displayW, displayH, overlay, screenshot, root);
    };
    img.src = screenshot.dataUrl;
    overlay.querySelector("#bt-ann-cancel").addEventListener("click", () => overlay.remove());
    const escHandler = (e2) => {
      if (e2.key === "Escape") {
        overlay.remove();
        document.removeEventListener("keydown", escHandler);
      }
    };
    document.addEventListener("keydown", escHandler);
  }
  function initAnnotationCanvas(canvas, width, height, overlay, screenshot, root) {
    const ctx = canvas.getContext("2d");
    const actions = [];
    let currentTool = "rect";
    let currentColor = "#ef4444";
    let isDrawing = false;
    let startX = 0, startY = 0;
    function redraw() {
      ctx.clearRect(0, 0, width, height);
      for (const action of actions) {
        drawAction(ctx, action);
      }
    }
    function drawAction(c, a2) {
      c.strokeStyle = a2.color;
      c.fillStyle = a2.color;
      c.lineWidth = 2.5;
      if (a2.type === "rect") {
        const w = a2.endX - a2.startX;
        const h = a2.endY - a2.startY;
        c.globalAlpha = 0.15;
        c.fillRect(a2.startX, a2.startY, w, h);
        c.globalAlpha = 1;
        c.strokeRect(a2.startX, a2.startY, w, h);
      } else if (a2.type === "arrow") {
        drawArrow(c, a2.startX, a2.startY, a2.endX, a2.endY, a2.color);
      } else if (a2.type === "text" && a2.text) {
        c.font = "bold 14px system-ui, sans-serif";
        const metrics = c.measureText(a2.text);
        const padding = 4;
        c.globalAlpha = 0.85;
        c.fillStyle = "#000";
        c.fillRect(a2.startX - padding, a2.startY - 16, metrics.width + padding * 2, 22);
        c.globalAlpha = 1;
        c.fillStyle = a2.color;
        c.fillText(a2.text, a2.startX, a2.startY);
      }
    }
    function drawArrow(c, x1, y1, x2, y2, color2) {
      const headLen = 12;
      const angle2 = Math.atan2(y2 - y1, x2 - x1);
      c.strokeStyle = color2;
      c.fillStyle = color2;
      c.lineWidth = 2.5;
      c.beginPath();
      c.moveTo(x1, y1);
      c.lineTo(x2, y2);
      c.stroke();
      c.beginPath();
      c.moveTo(x2, y2);
      c.lineTo(x2 - headLen * Math.cos(angle2 - Math.PI / 6), y2 - headLen * Math.sin(angle2 - Math.PI / 6));
      c.lineTo(x2 - headLen * Math.cos(angle2 + Math.PI / 6), y2 - headLen * Math.sin(angle2 + Math.PI / 6));
      c.closePath();
      c.fill();
    }
    overlay.querySelectorAll(".bt-ann-tool").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tool = btn.dataset.tool || "";
        if (tool.startsWith("color-")) {
          currentColor = getComputedStyle(btn).backgroundColor;
          overlay.querySelectorAll("[data-tool^='color-']").forEach((cb) => {
            cb.style.border = `2px solid ${getComputedStyle(cb).backgroundColor}`;
          });
          btn.style.border = `2px solid #fff`;
          return;
        }
        currentTool = tool;
        overlay.querySelectorAll(".bt-ann-tool:not([data-tool^='color-'])").forEach((tb) => {
          tb.style.background = "#22222244";
          tb.style.color = "#888";
          tb.style.borderColor = "#33333344";
        });
        btn.style.background = "#3b82f633";
        btn.style.color = "#3b82f6";
        btn.style.borderColor = "#3b82f6";
      });
    });
    canvas.addEventListener("mousedown", (e2) => {
      const rect = canvas.getBoundingClientRect();
      startX = e2.clientX - rect.left;
      startY = e2.clientY - rect.top;
      if (currentTool === "text") {
        const text = prompt("Enter annotation text:");
        if (text) {
          actions.push({ type: "text", color: currentColor, startX, startY, endX: startX, endY: startY, text });
          redraw();
        }
        return;
      }
      isDrawing = true;
    });
    canvas.addEventListener("mousemove", (e2) => {
      if (!isDrawing) return;
      const rect = canvas.getBoundingClientRect();
      const curX = e2.clientX - rect.left;
      const curY = e2.clientY - rect.top;
      redraw();
      const preview = { type: currentTool, color: currentColor, startX, startY, endX: curX, endY: curY };
      drawAction(ctx, preview);
    });
    canvas.addEventListener("mouseup", (e2) => {
      if (!isDrawing) return;
      isDrawing = false;
      const rect = canvas.getBoundingClientRect();
      const endX = e2.clientX - rect.left;
      const endY = e2.clientY - rect.top;
      if (Math.abs(endX - startX) < 5 && Math.abs(endY - startY) < 5) {
        redraw();
        return;
      }
      actions.push({ type: currentTool, color: currentColor, startX, startY, endX, endY });
      redraw();
    });
    overlay.querySelector("#bt-ann-undo").addEventListener("click", () => {
      actions.pop();
      redraw();
    });
    overlay.querySelector("#bt-ann-clear").addEventListener("click", () => {
      actions.length = 0;
      redraw();
    });
    overlay.querySelector("#bt-ann-save").addEventListener("click", () => {
      const merged = mergeAnnotations(screenshot.dataUrl, canvas, width, height);
      screenshot.dataUrl = merged;
      downloadScreenshot(merged, screenshot.filename);
      showToast2(`\u2713 Saved & downloaded: ${screenshot.filename}`, root);
      overlay.remove();
    });
    overlay.querySelector("#bt-ann-download").addEventListener("click", () => {
      const merged = mergeAnnotations(screenshot.dataUrl, canvas, width, height);
      const a2 = document.createElement("a");
      a2.href = merged;
      a2.download = screenshot.filename;
      document.body.appendChild(a2);
      a2.click();
      document.body.removeChild(a2);
      showToast2(`\u2713 Downloaded: ${screenshot.filename}`, root);
    });
  }
  function mergeAnnotations(baseDataUrl, annotationCanvas, w, h) {
    const mergeCanvas = document.createElement("canvas");
    mergeCanvas.width = w;
    mergeCanvas.height = h;
    const mCtx = mergeCanvas.getContext("2d");
    const img = new Image();
    img.src = baseDataUrl;
    mCtx.drawImage(img, 0, 0, w, h);
    mCtx.drawImage(annotationCanvas, 0, 0);
    return mergeCanvas.toDataURL("image/png", 0.9);
  }
  function annToolBtnStyle(active) {
    if (active) {
      return "background:#3b82f633;color:var(--tb-info, #3b82f6);border:1px solid #3b82f6;border-radius:5px;padding:5px 12px;cursor:pointer;font-size:12px;font-family:var(--tb-font-family, inherit);";
    }
    return "background:#22222244;color:var(--tb-text-muted, #888);border:1px solid #33333344;border-radius:5px;padding:5px 12px;cursor:pointer;font-size:12px;font-family:var(--tb-font-family, inherit);";
  }
  function annActionBtnStyle() {
    return "background:#22222244;color:var(--tb-text-muted, #888);border:1px solid #33333344;border-radius:5px;padding:5px 10px;cursor:pointer;font-size:11px;font-family:var(--tb-font-family, inherit);";
  }

  // src/index.ts
  init_collectors();
  init_environment();
  init_screenshot();
  init_plan();
  init_upgrade_modal();
  init_report_builder();
  init_github_issue();
  init_jira_issue();
  init_title_generator();
  init_voice_recorder();
  init_video_recorder();

  // src/theme.ts
  var DARK_THEME = {
    "--tb-bg-primary": "#0f0f1a",
    "--tb-bg-secondary": "#1a1a2e",
    "--tb-bg-elevated": "#22223a",
    "--tb-bg-overlay": "#0f0f1aee",
    "--tb-text-primary": "#e0e0e0",
    "--tb-text-secondary": "#aaaaaa",
    "--tb-text-muted": "#666666",
    "--tb-accent": "#7B61FF",
    "--tb-accent-hover": "#9B81FF",
    "--tb-accent-subtle": "#7B61FF33",
    "--tb-error": "#ef4444",
    "--tb-error-bg": "#ef444422",
    "--tb-warning": "#f97316",
    "--tb-warning-bg": "#f9731622",
    "--tb-success": "#22c55e",
    "--tb-success-bg": "#22c55e22",
    "--tb-info": "#3b82f6",
    "--tb-info-bg": "#3b82f622",
    "--tb-border": "#2a2a3e",
    "--tb-border-subtle": "#1f1f33",
    "--tb-border-hover": "#4a4a6e",
    "--tb-radius-sm": "4px",
    "--tb-radius-md": "8px",
    "--tb-radius-lg": "12px",
    "--tb-shadow-sm": "0 2px 8px rgba(0,0,0,0.3)",
    "--tb-shadow-md": "0 4px 24px rgba(0,0,0,0.5)",
    "--tb-shadow-lg": "0 8px 32px rgba(0,0,0,0.6)",
    "--tb-font-family": "system-ui, -apple-system, sans-serif",
    "--tb-font-mono": "'SF Mono', Consolas, ui-monospace, monospace",
    "--tb-toolbar-bg": "#0f0f1aee",
    "--tb-panel-bg": "#0f0f1a",
    "--tb-btn-hover": "#ffffff15",
    "--tb-btn-text": "#aaaaaa",
    "--tb-btn-text-hover": "#ffffff",
    "--tb-severity-critical": "#ef4444",
    "--tb-severity-major": "#f97316",
    "--tb-severity-minor": "#eab308",
    "--tb-severity-info": "#3b82f6",
    "--tb-intent-fix": "#ef4444",
    "--tb-intent-redesign": "#7B61FF",
    "--tb-intent-remove": "#f97316",
    "--tb-intent-question": "#3b82f6",
    "--tb-highlight": "#7B61FF",
    "--tb-selection": "#00E5FF",
    "--tb-gradient-start": "#7B61FF",
    "--tb-gradient-end": "#5B3FDF"
  };
  var LIGHT_THEME = {
    "--tb-bg-primary": "#ffffff",
    "--tb-bg-secondary": "#f5f5f7",
    "--tb-bg-elevated": "#ffffff",
    "--tb-bg-overlay": "#ffffffee",
    "--tb-text-primary": "#1a1a2e",
    "--tb-text-secondary": "#555555",
    "--tb-text-muted": "#999999",
    "--tb-accent": "#6B4FE0",
    "--tb-accent-hover": "#5A3ED0",
    "--tb-accent-subtle": "#6B4FE022",
    "--tb-error": "#dc2626",
    "--tb-error-bg": "#fef2f2",
    "--tb-warning": "#ea580c",
    "--tb-warning-bg": "#fff7ed",
    "--tb-success": "#16a34a",
    "--tb-success-bg": "#f0fdf4",
    "--tb-info": "#2563eb",
    "--tb-info-bg": "#eff6ff",
    "--tb-border": "#e0e0e6",
    "--tb-border-subtle": "#f0f0f4",
    "--tb-border-hover": "#c0c0cc",
    "--tb-radius-sm": "4px",
    "--tb-radius-md": "8px",
    "--tb-radius-lg": "12px",
    "--tb-shadow-sm": "0 1px 4px rgba(0,0,0,0.08)",
    "--tb-shadow-md": "0 4px 16px rgba(0,0,0,0.12)",
    "--tb-shadow-lg": "0 8px 32px rgba(0,0,0,0.16)",
    "--tb-font-family": "system-ui, -apple-system, sans-serif",
    "--tb-font-mono": "'SF Mono', Consolas, ui-monospace, monospace",
    "--tb-toolbar-bg": "#ffffffee",
    "--tb-panel-bg": "#ffffff",
    "--tb-btn-hover": "#00000010",
    "--tb-btn-text": "#666666",
    "--tb-btn-text-hover": "#1a1a2e",
    "--tb-severity-critical": "#dc2626",
    "--tb-severity-major": "#ea580c",
    "--tb-severity-minor": "#ca8a04",
    "--tb-severity-info": "#2563eb",
    "--tb-intent-fix": "#dc2626",
    "--tb-intent-redesign": "#6B4FE0",
    "--tb-intent-remove": "#ea580c",
    "--tb-intent-question": "#2563eb",
    "--tb-highlight": "#6B4FE0",
    "--tb-selection": "#0ea5e9",
    "--tb-gradient-start": "#6B4FE0",
    "--tb-gradient-end": "#4A2FC0"
  };
  var THEME_STYLE_ID = "tracebug-theme-vars";
  var _currentMode = "dark";
  var _mediaQuery = null;
  var _mediaListener = null;
  function getResolvedTheme() {
    if (_currentMode === "auto") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return _currentMode === "dark" ? "dark" : "light";
  }
  function getThemeTokens() {
    return getResolvedTheme() === "dark" ? DARK_THEME : LIGHT_THEME;
  }
  function injectTheme(mode) {
    _currentMode = mode;
    _applyThemeVars();
    if (mode === "auto") {
      _mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      _mediaListener = () => _applyThemeVars();
      _mediaQuery.addEventListener("change", _mediaListener);
    }
  }
  function removeTheme() {
    const el = document.getElementById(THEME_STYLE_ID);
    if (el) el.remove();
    if (_mediaQuery && _mediaListener) {
      _mediaQuery.removeEventListener("change", _mediaListener);
      _mediaQuery = null;
      _mediaListener = null;
    }
  }
  function _applyThemeVars() {
    const tokens = getThemeTokens();
    let existing = document.getElementById(THEME_STYLE_ID);
    if (!existing) {
      existing = document.createElement("style");
      existing.id = THEME_STYLE_ID;
      document.head.appendChild(existing);
    }
    const vars = Object.entries(tokens).map(([k, v]) => `  ${k}: ${v};`).join("\n");
    existing.textContent = `
    #tracebug-root {
${vars}
    }
  `;
  }

  // src/plugin-system.ts
  var _plugins = [];
  var _hooks = /* @__PURE__ */ new Map();
  function registerPlugin(plugin) {
    if (_plugins.some((p) => p.name === plugin.name)) {
      console.warn(`[TraceBug] Plugin "${plugin.name}" already registered.`);
      return;
    }
    _plugins.push(plugin);
    if (plugin.onInit) plugin.onInit();
  }
  function unregisterPlugin(name) {
    const idx = _plugins.findIndex((p) => p.name === name);
    if (idx >= 0) {
      const plugin = _plugins[idx];
      if (plugin.onDestroy) plugin.onDestroy();
      _plugins.splice(idx, 1);
    }
  }
  function runEventPlugins(event) {
    let result = event;
    for (const plugin of _plugins) {
      if (plugin.onEvent && result) {
        result = plugin.onEvent(result);
      }
    }
    return result;
  }
  function onHook(event, callback) {
    if (!_hooks.has(event)) _hooks.set(event, /* @__PURE__ */ new Set());
    _hooks.get(event).add(callback);
    return () => {
      const set = _hooks.get(event);
      if (set) set.delete(callback);
    };
  }
  function emitHook(event, ...args) {
    const callbacks = _hooks.get(event);
    if (!callbacks) return;
    for (const cb of callbacks) {
      try {
        cb(...args);
      } catch (err) {
        console.warn(`[TraceBug] Hook "${event}" error:`, err);
      }
    }
  }
  function clearAllPlugins() {
    for (const plugin of _plugins) {
      if (plugin.onDestroy) plugin.onDestroy();
    }
    _plugins.length = 0;
    _hooks.clear();
  }

  // src/index.ts
  init_storage();
  init_repro_generator();
  init_environment();
  init_screenshot();
  init_plan();
  init_report_builder();
  init_collectors();
  init_github_issue();
  init_jira_issue();
  init_title_generator();
  init_timeline_builder();
  init_voice_recorder();
  init_video_recorder();
  var import_meta = {};
  var TraceBugSDK = class {
    constructor() {
      this.config = null;
      this.cleanups = [];
      this.initialized = false;
      this.recording = true;
      this.sessionId = null;
      this._lastErrorPromptAt = 0;
      this._lastErrorMsgPrompted = null;
    }
    /**
     * Initialize TraceBug. Call once on app startup.
     *
     *   TraceBug.init({ projectId: "my-app" });
     *
     * Options:
     *  - projectId:       Required. Identifies your app.
     *  - maxEvents:       Max events per session in storage (default 200).
     *  - maxSessions:     Max sessions kept in localStorage (default 50).
     *  - enableDashboard: Show the floating bug button (default true).
     *  - enabled:         Control when SDK is active (default "auto").
     */
    init(config) {
      var _a, _b;
      if (this.initialized) {
        console.warn("[TraceBug] Already initialized.");
        return;
      }
      if (!config || typeof config !== "object") {
        console.warn("[TraceBug] init() requires a config object.");
        return;
      }
      if (!config.projectId || typeof config.projectId !== "string") {
        console.warn("[TraceBug] init() requires a projectId string.");
        return;
      }
      if (config.maxEvents !== void 0 && (typeof config.maxEvents !== "number" || config.maxEvents < 1)) {
        console.warn("[TraceBug] maxEvents must be a positive number. Using default (200).");
        config.maxEvents = 200;
      }
      if (config.maxSessions !== void 0 && (typeof config.maxSessions !== "number" || config.maxSessions < 1)) {
        console.warn("[TraceBug] maxSessions must be a positive number. Using default (50).");
        config.maxSessions = 50;
      }
      if (!this.shouldEnable((_a = config.enabled) != null ? _a : "auto")) {
        console.info("[TraceBug] Disabled in this environment.");
        return;
      }
      try {
        this.config = {
          maxEvents: 200,
          maxSessions: 50,
          enableDashboard: true,
          theme: "dark",
          toolbarPosition: "right",
          minimized: false,
          captureConsole: "errors",
          ...config
        };
        this.initialized = true;
        this.recording = true;
        this.sessionId = getSessionId();
        const sessionId = this.sessionId;
        try {
          injectTheme(this.config.theme);
        } catch (e2) {
        }
        hydratePlan().catch(() => {
        });
        if (this.config.githubRepo) {
          Promise.resolve().then(() => (init_quick_bug(), quick_bug_exports)).then((m) => m.setGithubRepo(this.config.githubRepo)).catch(() => {
          });
        }
        try {
          const env = captureEnvironment();
          saveEnvironment(sessionId, env);
        } catch (e2) {
        }
        try {
          const storedUser = localStorage.getItem("tracebug_user");
          if (storedUser) {
            const user = JSON.parse(storedUser);
            const sessions = getAllSessions();
            const session = sessions.find((s) => s.sessionId === sessionId);
            if (session) {
              session.user = user;
              localStorage.setItem("tracebug_sessions", JSON.stringify(sessions));
            }
          }
        } catch (e2) {
        }
        const emit = (type, data) => {
          var _a2, _b2, _c;
          try {
            if (!this.recording) return;
            let event = {
              id: Math.random().toString(36).slice(2, 10),
              sessionId,
              projectId: this.config.projectId,
              type,
              page: window.location.pathname,
              timestamp: Date.now(),
              data
            };
            event = runEventPlugins(event);
            if (!event) return;
            appendEvent(sessionId, event, this.config.maxEvents, this.config.maxSessions);
            if (type === "error" || type === "unhandled_rejection") {
              this.processError(sessionId, (_a2 = data.error) == null ? void 0 : _a2.message, (_b2 = data.error) == null ? void 0 : _b2.stack);
              emitHook("error:captured", event);
              this.maybePromptErrorCapture((_c = data.error) == null ? void 0 : _c.message);
            }
          } catch (err) {
            if (typeof console !== "undefined") console.warn("[TraceBug] Event emit error:", err);
          }
        };
        this.cleanups.push(collectClicks(emit));
        this.cleanups.push(collectInputs(emit));
        this.cleanups.push(collectSelectChanges(emit));
        this.cleanups.push(collectFormSubmits(emit));
        this.cleanups.push(collectRouteChanges(emit));
        this.cleanups.push(collectApiRequests(emit));
        this.cleanups.push(collectXhrRequests(emit));
        const consoleLevel = (_b = this.config.captureConsole) != null ? _b : "errors";
        if (consoleLevel !== "none") {
          this.cleanups.push(collectErrors(emit));
          if (consoleLevel === "warnings" || consoleLevel === "all") {
            this.cleanups.push(collectConsoleWarnings(emit));
          }
          if (consoleLevel === "all") {
            this.cleanups.push(collectConsoleLogs(emit));
          }
        } else {
          this.cleanups.push(collectErrors(emit));
        }
        if (this.config.enableDashboard) {
          try {
            setRecordingState(this.recording, () => {
              if (this.recording) {
                this.pauseRecording();
              } else {
                this.resumeRecording();
              }
              updateRecordingState(this.recording);
            });
            this.cleanups.push(mountDashboard(this.config.toolbarPosition, this.config.shortcuts));
          } catch (err) {
            console.warn("[TraceBug] Dashboard mount failed:", err);
          }
        }
        emitHook("session:start", sessionId);
        console.info(
          `[TraceBug] Initialized \u2014 project: ${config.projectId}, session: ${sessionId}`
        );
      } catch (err) {
        console.warn("[TraceBug] Failed to initialize:", err);
        this.initialized = false;
        return;
      }
    }
    /** Pause recording — events will not be captured until resumed */
    pauseRecording() {
      this.recording = false;
      console.info("[TraceBug] Recording paused.");
    }
    /** Resume recording after a pause */
    resumeRecording() {
      this.recording = true;
      console.info("[TraceBug] Recording resumed.");
    }
    /** Alias for resumeRecording — matches the start/stop mental model */
    startRecording() {
      this.resumeRecording();
    }
    /**
     * Stop recording and open the ticket-review modal so the user can review
     * captured steps + screenshots and then export. Same underlying behavior
     * as pauseRecording(); the only difference is the auto-open of the modal.
     */
    stopRecording() {
      var _a;
      this.pauseRecording();
      if (!((_a = this.config) == null ? void 0 : _a.enableDashboard)) return;
      const root = document.getElementById("tracebug-root");
      if (!root) return;
      Promise.resolve().then(() => (init_quick_bug(), quick_bug_exports)).then((m) => m.showQuickBugCapture(root)).catch((err) => console.warn("[TraceBug] Failed to open ticket review:", err));
    }
    /** Check if currently recording */
    isRecording() {
      return this.recording;
    }
    /** Get current session ID */
    getSessionId() {
      return this.sessionId;
    }
    // ── Screenshot ──────────────────────────────────────────────────────
    /**
     * Free-plan check: returns true if another screenshot can be added. When
     * the limit is reached, fires the upgrade modal and returns false. Premium
     * always returns true.
     */
    _checkScreenshotLimit() {
      if (isPremium()) return true;
      if (getScreenshots().length < FREE_LIMITS.screenshots) return true;
      showUpgradeModal({
        feature: "Unlimited screenshots",
        message: `Free plan is capped at ${FREE_LIMITS.screenshots} screenshots per ticket. Upgrade for unlimited captures.`
      }, document.getElementById("tracebug-root"));
      return false;
    }
    /** Capture a screenshot of the current page */
    async takeScreenshot() {
      if (!this.sessionId) return null;
      if (!this._checkScreenshotLimit()) return null;
      const sessions = getAllSessions();
      const session = sessions.find((s) => s.sessionId === this.sessionId);
      const lastEvent = (session == null ? void 0 : session.events[session.events.length - 1]) || null;
      const screenshot = await captureScreenshot(lastEvent);
      console.info(`[TraceBug] Screenshot captured: ${screenshot.filename}`);
      return screenshot;
    }
    /**
     * Snipping-tool style screenshot: shows a fullscreen overlay, user drags
     * to select a region, returns the cropped image. Resolves to null if the
     * user presses Esc or selects a region smaller than 5x5 pixels.
     */
    async takeRegionScreenshot() {
      if (!this.sessionId) return null;
      if (!this._checkScreenshotLimit()) return null;
      const screenshot = await captureRegionScreenshot();
      if (screenshot) {
        console.info(`[TraceBug] Region screenshot captured: ${screenshot.filename}`);
      }
      return screenshot;
    }
    /** Get all screenshots from current session */
    getScreenshots() {
      return getScreenshots();
    }
    // ── Quick Bug Capture ───────────────────────────────────────────────
    /**
     * One-shot bug capture: takes screenshot with annotations, opens a modal
     * with auto-filled title + description + screenshot, and 1-click copy
     * actions (GitHub / Jira / Plain Text). Keyboard: Ctrl+Shift+B.
     *
     *   TraceBug.quickCapture();
     */
    async quickCapture() {
      const root = document.getElementById("tracebug-root");
      if (!root) {
        console.warn("[TraceBug] quickCapture requires the dashboard to be mounted.");
        return;
      }
      const { showQuickBugCapture: showQuickBugCapture2 } = await Promise.resolve().then(() => (init_quick_bug(), quick_bug_exports));
      return showQuickBugCapture2(root);
    }
    // ── Annotations ─────────────────────────────────────────────────────
    /** Add a tester note/annotation to the current session */
    addNote(options) {
      if (!this.sessionId) return;
      const annotation = {
        id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
        text: options.text,
        expected: options.expected,
        actual: options.actual,
        severity: options.severity || "info",
        screenshotId: options.screenshotId
      };
      addAnnotation(this.sessionId, annotation);
      console.info(`[TraceBug] Note added: "${options.text}"`);
    }
    // ── Voice Recording ─────────────────────────────────────────────────
    /** Check if voice recording is supported */
    isVoiceSupported() {
      return isVoiceSupported();
    }
    /** Start voice recording for bug description */
    startVoiceRecording(options) {
      return startVoiceRecording(options);
    }
    /** Stop voice recording and return transcript */
    stopVoiceRecording() {
      return stopVoiceRecording();
    }
    /** Check if voice is currently recording */
    isVoiceRecording() {
      return isVoiceRecording();
    }
    /** Get all voice transcripts */
    getVoiceTranscripts() {
      return getVoiceTranscripts();
    }
    // ── Video Recording ────────────────────────────────────────────────
    /** Check if screen recording is supported (getDisplayMedia + MediaRecorder). */
    isVideoSupported() {
      return isVideoSupported();
    }
    /** True while a screen recording is in progress. */
    isVideoRecording() {
      return isVideoRecording();
    }
    /**
     * Start a screen recording. Opens the browser's screen-picker dialog so the
     * user can choose a screen, window, or tab. Resolves to true if recording
     * started; false if the user cancelled or the browser refused.
     *
     * While recording, a floating HUD lets the QA tester add timestamped
     * comments without breaking flow. Comments are synced to video time and
     * attached to the bug report.
     */
    async startVideoRecording(options) {
      const ok = await startVideoRecording({
        withMicrophone: options == null ? void 0 : options.withMicrophone,
        onStatus: options == null ? void 0 : options.onStatus
      });
      if (!ok) return false;
      const root = document.getElementById("tracebug-root");
      if (root) {
        showRecordingHUD(root, {
          onStop: () => {
            this.stopVideoRecording().catch(() => {
            });
          }
        });
      }
      return true;
    }
    /**
     * Stop the screen recording, hide the HUD, and open the Quick Bug ticket
     * modal so the user can review + export immediately. Resolves to the
     * recording metadata, or null if no recording was active.
     */
    async stopVideoRecording() {
      var _a;
      const recording = await stopVideoRecording();
      hideRecordingHUD();
      if (recording && ((_a = this.config) == null ? void 0 : _a.enableDashboard)) {
        const root = document.getElementById("tracebug-root");
        if (root) {
          try {
            const m = await Promise.resolve().then(() => (init_quick_bug(), quick_bug_exports));
            await m.showQuickBugCapture(root);
          } catch (err) {
            console.warn("[TraceBug] Failed to open ticket review after recording:", err);
          }
        }
      }
      return recording;
    }
    /** Get the most recently captured screen recording (or null). */
    getLastVideoRecording() {
      return getLastVideoRecording();
    }
    // ── Report Generation ───────────────────────────────────────────────
    /**
     * Strip premium-only data (network errors, console errors) from a report
     * so free-plan exports include only basic metadata. Mutates and returns
     * the report. No-op for premium.
     */
    _redactForFreePlan(report) {
      if (isPremium()) return report;
      report.networkErrors = [];
      report.consoleErrors = [];
      return report;
    }
    /**
     * Branding prefix for export markdown. Premium + companyName configured →
     * a one-line attribution header. Free or no companyName → empty string.
     */
    _brandingPrefix() {
      var _a, _b;
      if (!isPremium()) return "";
      const name = (_b = (_a = this.config) == null ? void 0 : _a.companyName) == null ? void 0 : _b.trim();
      if (!name) return "";
      return `> _Reported via TraceBug \u2014 ${name}_

`;
    }
    // ── Plan (Freemium) ─────────────────────────────────────────────────
    /** Get the current plan: "free" or "premium". */
    getPlan() {
      return getPlan();
    }
    /** Convenience: returns true if the user is on the premium plan. */
    isPremium() {
      return isPremium();
    }
    /**
     * Set the plan. Used by the in-modal dev toggle and (future) upgrade
     * flow. Persists to chrome.storage.local + localStorage.
     */
    setPlan(plan) {
      return setPlan(plan);
    }
    /** Generate a complete bug report for the current session */
    generateReport() {
      if (!this.sessionId) return null;
      const sessions = getAllSessions();
      const session = sessions.find((s) => s.sessionId === this.sessionId);
      if (!session) return null;
      return this._redactForFreePlan(buildReport(session));
    }
    /** Generate GitHub issue markdown (free + premium). */
    getGitHubIssue() {
      const report = this.generateReport();
      if (!report) return null;
      return this._brandingPrefix() + generateGitHubIssue(report);
    }
    /**
     * Generate Jira ticket payload (premium). Free users see the upgrade
     * modal and receive null. Premium users get the full Jira-formatted
     * ticket including network/console metadata + optional company branding.
     */
    getJiraTicket() {
      if (!isPremium()) {
        showUpgradeModal({
          feature: "Jira ticket export",
          message: "Generate Jira-formatted tickets with priority + labels in one click. Upgrade to unlock."
        }, document.getElementById("tracebug-root"));
        return null;
      }
      const report = this.generateReport();
      if (!report) return null;
      const ticket = generateJiraTicket(report);
      const prefix = this._brandingPrefix();
      if (prefix) ticket.description = prefix + ticket.description;
      return ticket;
    }
    /**
     * Download a PDF bug report (premium). Free users see the upgrade modal
     * and the download is skipped.
     */
    downloadPdf() {
      if (!isPremium()) {
        showUpgradeModal({
          feature: "PDF export",
          message: "Get a polished, formatted PDF with screenshots and timeline embedded. Upgrade to unlock."
        }, document.getElementById("tracebug-root"));
        return;
      }
      const report = this.generateReport();
      if (!report) {
        console.warn("[TraceBug] No session data to generate PDF.");
        return;
      }
      generatePdfReport(report);
    }
    /** Get auto-generated bug title */
    getBugTitle() {
      if (!this.sessionId) return null;
      const sessions = getAllSessions();
      const session = sessions.find((s) => s.sessionId === this.sessionId);
      if (!session) return null;
      return generateBugTitle(session);
    }
    /** Get environment info */
    getEnvironment() {
      return captureEnvironment();
    }
    // ── Element Annotate Mode ────────────────────────────────────────────
    /** Activate element annotate mode — click elements to attach feedback */
    activateAnnotateMode() {
      const root = document.getElementById("tracebug-root");
      if (root) activateElementAnnotateMode(root);
    }
    /** Deactivate element annotate mode */
    deactivateAnnotateMode() {
      deactivateElementAnnotateMode();
    }
    /** Check if element annotate mode is active */
    isAnnotateModeActive() {
      return isElementAnnotateActive();
    }
    // ── Draw Mode ──────────────────────────────────────────────────────
    /** Activate draw mode — draw rectangles/ellipses on the live page */
    activateDrawMode() {
      const root = document.getElementById("tracebug-root");
      if (root) activateDrawMode(root);
    }
    /** Deactivate draw mode */
    deactivateDrawMode() {
      deactivateDrawMode();
    }
    /** Check if draw mode is active */
    isDrawModeActive() {
      return isDrawModeActive();
    }
    // ── UI Annotations ─────────────────────────────────────────────────
    /** Get complete annotation report (element annotations + draw regions) */
    getAnnotationReport() {
      return getAnnotationReport();
    }
    /** Export annotations as JSON string */
    exportAnnotationsJSON() {
      return exportAsJSON();
    }
    /** Export annotations as Markdown string */
    exportAnnotationsMarkdown() {
      return exportAsMarkdown();
    }
    /** Copy annotations to clipboard */
    async copyAnnotationsToClipboard(format) {
      return copyToClipboard(format);
    }
    /** Clear all UI annotations */
    clearAnnotations() {
      clearAllAnnotations();
    }
    // ── Plugin System ──────────────────────────────────────────────────
    /** Register a plugin */
    use(plugin) {
      registerPlugin(plugin);
    }
    /** Unregister a plugin by name */
    removePlugin(name) {
      unregisterPlugin(name);
    }
    /** Subscribe to a hook event. Returns unsubscribe function. */
    on(event, callback) {
      return onHook(event, callback);
    }
    // ── CI/CD Helpers ─────────────────────────────────────────────────
    /** Get error count for the current session (useful for CI assertions) */
    getErrorCount() {
      if (!this.sessionId) return 0;
      const sessions = getAllSessions();
      const session = sessions.find((s) => s.sessionId === this.sessionId);
      if (!session) return 0;
      return session.events.filter(
        (e2) => e2.type === "error" || e2.type === "unhandled_rejection"
      ).length;
    }
    /** Export current session as JSON (for CI artifact upload) */
    exportSessionJSON() {
      if (!this.sessionId) return null;
      const sessions = getAllSessions();
      const session = sessions.find((s) => s.sessionId === this.sessionId);
      if (!session) return null;
      return JSON.stringify(session, null, 2);
    }
    /** Flag the current session as a bug */
    markAsBug() {
      if (!this.sessionId) return;
      const sessions = getAllSessions();
      const session = sessions.find((s) => s.sessionId === this.sessionId);
      if (session) {
        session.isBug = true;
        try {
          const key = "tracebug_sessions";
          localStorage.setItem(key, JSON.stringify(sessions));
        } catch (e2) {
        }
      }
    }
    /**
     * Get a compact 2-3 sentence summary for Slack/Teams.
     * Example: "Bug on /vendor — TypeError: Cannot read 'status' after clicking Edit → selecting Inactive → clicking Update. Chrome 121, Windows 11."
     */
    getCompactReport() {
      var _a;
      if (!this.sessionId) return null;
      const sessions = getAllSessions();
      const session = sessions.find((s) => s.sessionId === this.sessionId);
      if (!session) return null;
      const page = ((_a = session.events[0]) == null ? void 0 : _a.page) || "/";
      const error = session.errorMessage || "no errors";
      const env = session.environment;
      const browser = env ? `${env.browser} ${env.browserVersion}` : "Unknown browser";
      const os = env ? env.os : "Unknown OS";
      const actions = session.events.filter((e2) => ["click", "input", "select_change", "form_submit"].includes(e2.type)).slice(-5).map((e2) => {
        var _a2, _b, _c, _d, _e, _f;
        if (e2.type === "click") return `clicking ${((_b = (_a2 = e2.data.element) == null ? void 0 : _a2.text) == null ? void 0 : _b.slice(0, 30)) || ((_c = e2.data.element) == null ? void 0 : _c.tag) || "element"}`;
        if (e2.type === "input") return `typing in ${((_d = e2.data.element) == null ? void 0 : _d.name) || "field"}`;
        if (e2.type === "select_change") return `selecting "${((_f = (_e = e2.data.element) == null ? void 0 : _e.selectedText) == null ? void 0 : _f.slice(0, 20)) || "option"}"`;
        if (e2.type === "form_submit") return `submitting form`;
        return e2.type;
      });
      const flow = actions.length > 0 ? ` after ${actions.join(" \u2192 ")}` : "";
      const failedApis = session.events.filter((e2) => {
        var _a2, _b;
        return e2.type === "api_request" && (((_a2 = e2.data.request) == null ? void 0 : _a2.statusCode) >= 400 || ((_b = e2.data.request) == null ? void 0 : _b.statusCode) === 0);
      }).slice(0, 1).map((e2) => {
        var _a2, _b, _c, _d, _e;
        return `${(_a2 = e2.data.request) == null ? void 0 : _a2.method} ${(_d = (_c = (_b = e2.data.request) == null ? void 0 : _b.url) == null ? void 0 : _c.split("?")[0]) == null ? void 0 : _d.slice(-40)} returned ${(_e = e2.data.request) == null ? void 0 : _e.statusCode}`;
      });
      const apiNote = failedApis.length > 0 ? ` ${failedApis[0]}.` : "";
      return `Bug on ${page} \u2014 ${error}${flow}.${apiNote} ${browser}, ${os}.`;
    }
    // ── User Identification ────────────────────────────────────────────
    /**
     * Identify the current user. Attached to the session for attribution.
     * Stored in localStorage so it persists across page loads.
     *
     * TraceBug.setUser({ id: "user_123", email: "dev@example.com", name: "Jane" });
     */
    setUser(user) {
      if (!user.id) {
        console.warn("[TraceBug] setUser() requires an id field.");
        return;
      }
      try {
        localStorage.setItem("tracebug_user", JSON.stringify(user));
      } catch (e2) {
      }
      if (this.sessionId) {
        try {
          const sessions = getAllSessions();
          const session = sessions.find((s) => s.sessionId === this.sessionId);
          if (session) {
            session.user = user;
            localStorage.setItem("tracebug_sessions", JSON.stringify(sessions));
          }
        } catch (e2) {
        }
      }
    }
    /** Get the identified user (or null) */
    getUser() {
      try {
        const raw = localStorage.getItem("tracebug_user");
        return raw ? JSON.parse(raw) : null;
      } catch (e2) {
        return null;
      }
    }
    /** Clear the identified user */
    clearUser() {
      try {
        localStorage.removeItem("tracebug_user");
      } catch (e2) {
      }
    }
    // ── Private methods ─────────────────────────────────────────────────
    /**
     * Determine if TraceBug should be active based on the `enabled` config.
     */
    shouldEnable(mode) {
      if (mode === "off") return false;
      if (mode === "all") return true;
      if (Array.isArray(mode)) {
        const host2 = typeof window !== "undefined" ? window.location.hostname : "";
        return mode.some((h) => host2 === h || host2.endsWith("." + h));
      }
      const env = this.detectEnvironment();
      const host = typeof window !== "undefined" ? window.location.hostname : "";
      const isStaging = /staging|\.stg\.|\.uat\.|\.qa\.|\.dev\./i.test(host);
      if (mode === "development") {
        return env === "development";
      }
      if (mode === "staging") {
        return env === "development" || isStaging;
      }
      if (env === "production" && !isStaging) {
        return false;
      }
      return true;
    }
    /**
     * Detect the current environment from various sources.
     */
    detectEnvironment() {
      var _a;
      try {
        if (typeof (import_meta == null ? void 0 : import_meta.env) !== "undefined") {
          const meta = import_meta.env;
          if (meta.PROD === true) return "production";
          if (meta.DEV === true) return "development";
          if (meta.MODE) return meta.MODE;
        }
      } catch (e2) {
      }
      try {
        const g = globalThis;
        if (typeof g.process !== "undefined" && ((_a = g.process.env) == null ? void 0 : _a.NODE_ENV)) {
          return g.process.env.NODE_ENV;
        }
      } catch (e2) {
      }
      if (typeof window !== "undefined") {
        const host = window.location.hostname;
        if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "[::1]") {
          return "development";
        }
      }
      return "production";
    }
    /**
     * When an error event is captured, pull the session timeline from
     * localStorage and generate reproduction steps.
     */
    /**
     * Show an interactive toast prompting the user to capture a bug when an
     * error is detected. Throttled: same error message won't re-prompt within
     * 30 seconds; any error won't re-prompt within 5 seconds.
     */
    maybePromptErrorCapture(errorMessage) {
      var _a;
      if (!((_a = this.config) == null ? void 0 : _a.enableDashboard)) return;
      if (!errorMessage) return;
      const now = Date.now();
      if (now - this._lastErrorPromptAt < 5e3) return;
      if (this._lastErrorMsgPrompted === errorMessage && now - this._lastErrorPromptAt < 3e4) return;
      this._lastErrorPromptAt = now;
      this._lastErrorMsgPrompted = errorMessage;
      setTimeout(() => {
        try {
          const root = document.getElementById("tracebug-root");
          if (!root) return;
          Promise.all([
            Promise.resolve().then(() => (init_toast(), toast_exports)),
            Promise.resolve().then(() => (init_quick_bug(), quick_bug_exports))
          ]).then(([toastMod, qbMod]) => {
            const truncated = errorMessage.length > 60 ? errorMessage.slice(0, 60) + "\u2026" : errorMessage;
            toastMod.showActionToast(
              `\u26A0\uFE0F Error detected: ${truncated}`,
              "Capture bug",
              () => {
                qbMod.showQuickBugCapture(root).catch(() => {
                });
              },
              root
            );
          }).catch(() => {
          });
        } catch (e2) {
        }
      }, 200);
    }
    processError(sessionId, errorMessage, errorStack) {
      if (!errorMessage) return;
      setTimeout(() => {
        const sessions = getAllSessions();
        const session = sessions.find((s) => s.sessionId === sessionId);
        if (!session) return;
        const result = generateReproSteps(
          session.events,
          errorMessage,
          errorStack
        );
        updateSessionError(
          sessionId,
          errorMessage,
          errorStack,
          result.reproSteps,
          result.errorSummary
        );
        console.info(
          "[TraceBug] Bug report generated. Click the bug button to view reproduction steps."
        );
      }, 100);
    }
    /**
     * Tear down the SDK — removes all listeners and the dashboard.
     */
    destroy() {
      flushPendingEvents();
      this.cleanups.forEach((fn) => fn());
      this.cleanups = [];
      this.initialized = false;
      this.config = null;
      this.recording = false;
      this.sessionId = null;
      clearScreenshots();
      clearVoiceTranscripts();
      abortVideoRecording();
      clearVideoRecording();
      hideRecordingHUD();
      clearNetworkFailures();
      deactivateElementAnnotateMode();
      deactivateDrawMode();
      clearAllAnnotations();
      clearAllPlugins();
      removeTheme();
    }
    // ── Network Failures ────────────────────────────────────────────────
    /**
     * Get the last 10 failed network requests with response body snippets.
     * Returned from an in-memory ring buffer — snapshot at call time.
     */
    getNetworkFailures() {
      return getNetworkFailures();
    }
  };
  var TraceBug = new TraceBugSDK();
  var src_default = TraceBug;
  return __toCommonJS(src_exports);
})();
/*! Bundled license information:

html2canvas/dist/html2canvas.esm.js:
  (*!
   * html2canvas 1.4.1 <https://html2canvas.hertzen.com>
   * Copyright (c) 2022 Niklas von Hertzen <https://hertzen.com>
   * Released under MIT License
   *)
  (*! *****************************************************************************
  Copyright (c) Microsoft Corporation.
  
  Permission to use, copy, modify, and/or distribute this software for any
  purpose with or without fee is hereby granted.
  
  THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
  REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
  AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
  INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
  LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
  OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
  PERFORMANCE OF THIS SOFTWARE.
  ***************************************************************************** *)
*/

        // Expose TraceBug on window for extension use (only once)
        if (typeof window !== 'undefined' && typeof TraceBugModule !== 'undefined' && !window.__TRACEBUG_LOADED__) {
          window.__TRACEBUG_LOADED__ = true;
          window.TraceBug = TraceBugModule.default || TraceBugModule;
          window.TraceBugSDK = TraceBugModule;
        }
      
