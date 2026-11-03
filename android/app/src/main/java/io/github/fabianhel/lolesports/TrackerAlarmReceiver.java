package io.github.fabianhel.lolesports;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Empfängt den Vormerk-Alarm, "Vormerkung löschen" sowie Neustart/App-Update. */
public class TrackerAlarmReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent != null ? intent.getAction() : null;
        if (TrackerScheduler.ACTION_FIRE.equals(action)) {
            TrackerScheduler.fire(context);
        } else if (TrackerScheduler.ACTION_CANCEL.equals(action)) {
            TrackerScheduler.cancel(context);
        } else if (Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            TrackerScheduler.restore(context);
        }
    }
}
