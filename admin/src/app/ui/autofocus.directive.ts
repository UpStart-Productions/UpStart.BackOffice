import { AfterViewInit, Directive, ElementRef, inject } from '@angular/core';

/** Focus (and select) an input when it is rendered, e.g. an inline rename field. */
@Directive({ selector: '[appAutofocus]', standalone: true })
export class AutofocusDirective implements AfterViewInit {
  private readonly el = inject<ElementRef<HTMLInputElement>>(ElementRef);

  ngAfterViewInit() {
    // After the current render so PrimeNG/overlays don't steal focus back.
    setTimeout(() => {
      this.el.nativeElement.focus();
      this.el.nativeElement.select?.();
    });
  }
}
