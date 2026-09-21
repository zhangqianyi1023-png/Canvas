import 'package:flutter/material.dart';

/// Current Hurricane baseline tokens, sanitized for the external UI handoff.
///
/// They are a starting point, not the frozen visual truth. The designer may
/// propose changes, but final values must be recorded in the PRD and reviewed
/// before the production adapter adopts them.
abstract final class StoryboardColors {
  static const brandPrimary = Color(0xFF00FFFF);
  static const brandPrimaryHover = Color(0xFF42FFFF);
  static const brandPrimaryActive = Color(0xFF00D4D4);
  static const canvas = Color(0xFF000000);
  static const appSurface = Color(0xFF0D0D0F);
  static const panel = Color(0xFF16161A);
  static const panelRaised = Color(0xFF1D1E24);
  static const control = Color(0xFF1A1A1A);
  static const border = Color(0xFF34343C);
  static const textPrimary = Color(0xFFFFFFFF);
  static const textSecondary = Color(0xFFD1D5DB);
  static const textTertiary = Color(0xFF9CA3AF);
  static const success = Color(0xFF2FE6A6);
  static const warning = Color(0xFFF7C948);
  static const danger = Color(0xFFF87171);
  static const info = Color(0xFF60A5FA);
}

abstract final class StoryboardSpacing {
  static const double x2 = 2;
  static const double x4 = 4;
  static const double x6 = 6;
  static const double x8 = 8;
  static const double x10 = 10;
  static const double x12 = 12;
  static const double x16 = 16;
  static const double x20 = 20;
  static const double x24 = 24;
  static const double x32 = 32;
  static const double x40 = 40;
  static const double x48 = 48;
}

abstract final class StoryboardRadii {
  static const double xs = 4;
  static const double sm = 6;
  static const double md = 8;
  static const double lg = 10;
  static const double xl = 14;
  static const double pill = 999;
}

@immutable
class StoryboardDesignTokens extends ThemeExtension<StoryboardDesignTokens> {
  const StoryboardDesignTokens({
    required this.brandPrimary,
    required this.canvas,
    required this.panel,
    required this.panelRaised,
    required this.border,
    required this.textPrimary,
    required this.textSecondary,
    required this.textTertiary,
    required this.success,
    required this.warning,
    required this.danger,
    required this.info,
  });

  static const baseline = StoryboardDesignTokens(
    brandPrimary: StoryboardColors.brandPrimary,
    canvas: StoryboardColors.canvas,
    panel: StoryboardColors.panel,
    panelRaised: StoryboardColors.panelRaised,
    border: StoryboardColors.border,
    textPrimary: StoryboardColors.textPrimary,
    textSecondary: StoryboardColors.textSecondary,
    textTertiary: StoryboardColors.textTertiary,
    success: StoryboardColors.success,
    warning: StoryboardColors.warning,
    danger: StoryboardColors.danger,
    info: StoryboardColors.info,
  );

  final Color brandPrimary;
  final Color canvas;
  final Color panel;
  final Color panelRaised;
  final Color border;
  final Color textPrimary;
  final Color textSecondary;
  final Color textTertiary;
  final Color success;
  final Color warning;
  final Color danger;
  final Color info;

  @override
  StoryboardDesignTokens copyWith({
    Color? brandPrimary,
    Color? canvas,
    Color? panel,
    Color? panelRaised,
    Color? border,
    Color? textPrimary,
    Color? textSecondary,
    Color? textTertiary,
    Color? success,
    Color? warning,
    Color? danger,
    Color? info,
  }) {
    return StoryboardDesignTokens(
      brandPrimary: brandPrimary ?? this.brandPrimary,
      canvas: canvas ?? this.canvas,
      panel: panel ?? this.panel,
      panelRaised: panelRaised ?? this.panelRaised,
      border: border ?? this.border,
      textPrimary: textPrimary ?? this.textPrimary,
      textSecondary: textSecondary ?? this.textSecondary,
      textTertiary: textTertiary ?? this.textTertiary,
      success: success ?? this.success,
      warning: warning ?? this.warning,
      danger: danger ?? this.danger,
      info: info ?? this.info,
    );
  }

  @override
  StoryboardDesignTokens lerp(
    covariant ThemeExtension<StoryboardDesignTokens>? other,
    double t,
  ) {
    if (other is! StoryboardDesignTokens) return this;
    return StoryboardDesignTokens(
      brandPrimary: Color.lerp(brandPrimary, other.brandPrimary, t)!,
      canvas: Color.lerp(canvas, other.canvas, t)!,
      panel: Color.lerp(panel, other.panel, t)!,
      panelRaised: Color.lerp(panelRaised, other.panelRaised, t)!,
      border: Color.lerp(border, other.border, t)!,
      textPrimary: Color.lerp(textPrimary, other.textPrimary, t)!,
      textSecondary: Color.lerp(textSecondary, other.textSecondary, t)!,
      textTertiary: Color.lerp(textTertiary, other.textTertiary, t)!,
      success: Color.lerp(success, other.success, t)!,
      warning: Color.lerp(warning, other.warning, t)!,
      danger: Color.lerp(danger, other.danger, t)!,
      info: Color.lerp(info, other.info, t)!,
    );
  }
}

extension StoryboardThemeContext on BuildContext {
  StoryboardDesignTokens get storyboardTokens =>
      Theme.of(this).extension<StoryboardDesignTokens>() ??
      StoryboardDesignTokens.baseline;
}
