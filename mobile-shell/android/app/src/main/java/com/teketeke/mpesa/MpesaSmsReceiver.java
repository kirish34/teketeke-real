package com.teketeke.mpesa;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.provider.Telephony;
import android.telephony.SmsMessage;

/**
 * BroadcastReceiver that listens for incoming SMS and forwards
 * potential M-Pesa messages to MpesaSmsStore.
 *
 * NOTE:
 *  - On modern Android versions, only the default SMS app receives the full SMS broadcast.
 *  - This skeleton is primarily for side-loaded / enterprise builds where SMS access is allowed.
 */
public class MpesaSmsReceiver extends BroadcastReceiver {

  @Override
  public void onReceive(Context context, Intent intent) {
    if (!MpesaSmsStore.isEnabled()) {
      return;
    }
    if (intent == null || !Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) {
      return;
    }

    SmsMessage[] messages = Telephony.Sms.Intents.getMessagesFromIntent(intent);
    if (messages == null || messages.length == 0) {
      return;
    }

    StringBuilder bodyBuilder = new StringBuilder();
    String from = null;
    long timestamp = System.currentTimeMillis();

    for (SmsMessage msg : messages) {
      if (msg == null) continue;
      if (from == null) {
        from = msg.getOriginatingAddress();
      }
      bodyBuilder.append(msg.getMessageBody());
      timestamp = msg.getTimestampMillis();
    }

    String body = bodyBuilder.toString();
    MpesaSmsStore.MpesaItem item = MpesaSmsParser.parse(from, body, timestamp);
    if (item != null) {
      MpesaSmsStore.add(item);
    }
  }
}

