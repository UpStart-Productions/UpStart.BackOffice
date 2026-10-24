import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app';
import { appConfig } from './app/app.config';

try {
  localStorage.removeItem('ubo_dark_theme');
} catch {
  /* ignore */
}
document.documentElement.classList.remove('app-dark');

bootstrapApplication(AppComponent, appConfig).catch((err) => console.error(err));
