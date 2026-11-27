import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { DEPARTMENTS } from './core/departments.data';

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render Home, Our Departments and Contact links plus a Login button', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const navText = compiled.querySelector('.nav-menu')?.textContent ?? '';
    expect(navText).toContain('Home');
    expect(navText).toContain('Our Departments');
    expect(navText).not.toContain('About Us');
    expect(navText).toContain('Contact');
    expect(compiled.querySelector('.login-button')?.textContent).toContain('Login');
  });

  it('should open the departments dropdown with a link to each department', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-dept-dropdown .panel')).toBeNull();

    compiled.querySelector<HTMLButtonElement>('app-dept-dropdown .trigger')!.click();
    await fixture.whenStable();

    const items = compiled.querySelectorAll<HTMLAnchorElement>('app-dept-dropdown .item');
    expect(items.length).toBe(DEPARTMENTS.length);
    expect(items[0].getAttribute('href')).toBe(`/departments/${DEPARTMENTS[0].slug}`);
  });
});
