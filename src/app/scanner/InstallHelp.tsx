/** Native browser installation is sufficient; no prompt interception or offline setup. */
export default function InstallHelp() {
  return (
    <details className="mt-7 text-sm text-text-muted [@media(display-mode:standalone)]:hidden">
      <summary className="min-h-12 cursor-pointer py-3 font-bold text-text-secondary focus-visible:outline-2 focus-visible:outline-accent-teal">
        ADD TO HOME SCREEN
      </summary>
      <div className="space-y-3 pb-3 leading-relaxed">
        <p><strong>iPhone:</strong> In Safari, tap Share → Add to Home Screen. Choose Open as Web App if offered, then Add.</p>
        <p><strong>Android:</strong> Open the Chrome menu and choose Install app or Add to Home screen.</p>
        <p>Launch the scanner from its home-screen icon. An internet connection is required to verify badges.</p>
      </div>
    </details>
  );
}
