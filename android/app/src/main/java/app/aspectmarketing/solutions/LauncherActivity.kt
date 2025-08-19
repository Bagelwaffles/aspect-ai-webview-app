package app.aspectmarketing.solutions

import android.os.Bundle
import com.google.androidbrowserhelper.trusted.LauncherActivity

class LauncherActivity : LauncherActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
    }

    override fun getLauncherActivityThemeResId(): Int {
        return R.style.Theme_AspectMarketing_LauncherActivity
    }
}
