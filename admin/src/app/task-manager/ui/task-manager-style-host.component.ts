import { Component, ViewEncapsulation } from '@angular/core';

/** Injects Task Manager feature CSS once when task mode is active (global class names, no encapsulation). */
@Component({
  selector: 'app-tm-style-host',
  standalone: true,
  template: '',
  styleUrl: '../styles/task-manager-features.scss',
  encapsulation: ViewEncapsulation.None,
})
export class TaskManagerStyleHostComponent {}
