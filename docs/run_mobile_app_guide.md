# Running the DECP Mobile Application

Follow these steps to successfully launch and test the Flutter mobile application alongside your existing Kubernetes backend infrastructure. 

### Prerequisites
Before running the mobile app, ensure your backend API cluster is running and accessible. 

1. Ensure Kubernetes/Docker services are running:
   ```bash
   kubectl get pods -A
   ```
2. Ensure you have the Flutter SDK configured. The tests we just ran show your Flutter environment is completely healthy!

---

### Method A: Running Natively on Linux (Fastest for testing)

Since you are running Ubuntu desktop natively, testing the app as a compiled Linux desktop application is typically the fastest and most reliable way to check the UI without dealing with Android emulation network bridging.

1. Open a new terminal.
2. Navigate to the mobile directory:
   ```bash
   cd /home/gintoki/Semester07/CO528/mini_project/mobile/delta
   ```
3. Run the App:
   ```bash
   flutter run -d linux
   ```
*This command will compile and launch the application directly on your workstation window.*

---

### Method B: Running on an Android Emulator

If you want the true mobile experience, you will need to boot an Android Virtual Device (AVD).

1. First, check available emulators:
   ```bash
   flutter emulators
   ```
2. Start an emulator (replace `nexus_6` with your emulator name from step 1):
   ```bash
   flutter emulators --launch <emulator_name>
   ```
3. Open a new terminal and navigate to the mobile directory:
   ```bash
   cd /home/gintoki/Semester07/CO528/mini_project/mobile/delta
   ```
4. Run the app targetting Android:
   ```bash
   flutter run
   ```

### ⚠️ Important Note for Android Emulators!
Your app relies on networking queries sent to `http://miniproject.local/api/v1` (as mapped in the app interceptor configurations).
By default, an Android emulator uses a virtual router (`10.0.2.2`) which points to your Host's localhost loopback. The emulator **does not** automatically resolve local `/etc/hosts` DNS overrides like `miniproject.local`.

If you test using Android, you have three options to fix the API routing:
1. **Network Override:** Execute your API networking queries explicitly against the emulator host loopback `10.0.2.2` within the `/mobile/delta/lib/core/network` interceptors.
2. **DNS Setup:** Update the emulator's proxy routing to inject standard host `/etc/resolv.conf` rules.
3. **Just deploy to Linux Desktop instead!** (Method A is far simpler because it shares your machine's DNS resolution exactly).
