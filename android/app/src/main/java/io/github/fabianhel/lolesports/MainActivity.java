package io.github.fabianhel.lolesports;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LiveTrackerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
