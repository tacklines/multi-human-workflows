import type { Meta, StoryObj } from '@storybook/web-components';
import { html } from 'lit';

// Register the component
import '../components/shared/onboarding-overlay.js';

const meta: Meta = {
  title: 'Shared/OnboardingOverlay',
  tags: ['autodocs'],
  render: (args) => html`
    <onboarding-overlay ?force-show=${args.forceShow as boolean}></onboarding-overlay>
  `,
  argTypes: {
    forceShow: {
      control: 'boolean',
      description:
        'Force-show the overlay regardless of localStorage state. Useful for testing.',
    },
  },
  args: {
    forceShow: true,
  },
};

export default meta;
type Story = StoryObj;

/** Full-screen onboarding overlay in its initial state with all three steps visible. */
export const Default: Story = {};

/**
 * Overlay hidden (simulates a returning user who has already dismissed it).
 * Set `force-show` back to true via controls to re-display.
 */
export const Hidden: Story = {
  args: {
    forceShow: false,
  },
};

/**
 * Demonstrates the post-dismissal CTA banner.
 * Click "Get Started" or "Skip for now" in the Default story to see the
 * bottom CTA banner that appears briefly after dismissal.
 */
export const PostDismissalCTA: Story = {
  render: () => html`
    <div style="padding: 2rem; text-align: center; color: #6b7280;">
      <p style="margin-bottom: 1rem;">
        Click "Get Started" below to dismiss the overlay and reveal the CTA banner.
      </p>
      <onboarding-overlay force-show></onboarding-overlay>
    </div>
  `,
};
