package com.teketeke.mpesa;

import android.text.TextUtils;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Very lightweight M-Pesa SMS parser.
 *
 * NOTE:
 *  - This is heuristic and should be improved for your real message formats.
 *  - It only extracts a few fields: kind, amount, reference, counterparty.
 */
public final class MpesaSmsParser {

  // Matches amounts like "Ksh 1,234.50" or "KES 250"
  private static final Pattern AMOUNT_PATTERN =
    Pattern.compile("(KSH|KES)\\s*([0-9,]+(\\.[0-9]+)?)", Pattern.CASE_INSENSITIVE);

  // Simple reference token: strings starting with one or more letters/digits, often 10+ chars
  private static final Pattern REF_PATTERN =
    Pattern.compile("\\b([A-Z0-9]{8,})\\b");

  private MpesaSmsParser() {}

  public static MpesaSmsStore.MpesaItem parse(String from, String body, long timestampMillis) {
    if (body == null) return null;
    String text = body.trim();
    if (TextUtils.isEmpty(text)) return null;

    // Require M-Pesa keyword to avoid non-related SMS
    String lower = text.toLowerCase(Locale.ROOT);
    if (!lower.contains("m-pesa")) {
      return null;
    }

    MpesaSmsStore.MpesaItem item = new MpesaSmsStore.MpesaItem();

    // Determine direction (very rough heuristics)
    // "received", "sent to", "paid to", etc.
    if (lower.contains("you have received") || lower.contains("received from")) {
      item.kind = "IN";
    } else if (lower.contains("paid to") || lower.contains("sent to") || lower.contains("send to")) {
      item.kind = "OUT";
    } else {
      // default to OUT for payments
      item.kind = "OUT";
    }

    // Amount
    Matcher amountMatch = AMOUNT_PATTERN.matcher(text);
    if (amountMatch.find()) {
      String raw = amountMatch.group(2);
      if (raw != null) {
        raw = raw.replace(",", "");
        try {
          item.amount = Double.parseDouble(raw);
        } catch (NumberFormatException ignored) {
          item.amount = 0d;
        }
      }
    }

    if (item.amount <= 0d) {
      // Ignore messages where we couldn't parse a positive amount
      return null;
    }

    // Reference (best-effort)
    Matcher refMatch = REF_PATTERN.matcher(text);
    if (refMatch.find()) {
      item.mpesaRef = refMatch.group(1);
    }

    // Counterparty: best-effort guess using "to XYZ" part
    String counterparty = null;
    int idxTo = lower.indexOf(" to ");
    if (idxTo > 0) {
      String after = text.substring(idxTo + 4).trim();
      int stop = after.indexOf(".");
      if (stop > 0) {
        counterparty = after.substring(0, stop).trim();
      } else {
        counterparty = after;
      }
    }
    item.counterparty = counterparty;

    // Simple category guess for OUT transactions (you can enhance this)
    if ("OUT".equals(item.kind)) {
      String cat = "Other";
      if (lower.contains("fuel") || lower.contains("petrol") || lower.contains("shell") || lower.contains("total")) {
        cat = "Fuel";
      } else if (lower.contains("parking")) {
        cat = "Parking";
      } else if (lower.contains("garage") || lower.contains("service") || lower.contains("repair")) {
        cat = "Maintenance";
      }
      item.category = cat;
    }

    item.description = text;
    item.occurredAtIso = isoFromMillis(timestampMillis);
    return item;
  }

  private static String isoFromMillis(long ts) {
    // Very small helper; real apps should use java.time on API 26+
    java.text.SimpleDateFormat fmt =
      new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSZ", Locale.ROOT);
    return fmt.format(new java.util.Date(ts));
  }
}

