import 'package:flutter/material.dart';

import 'storyboard_design_tokens.dart';

ThemeData buildStoryboardPreviewTheme() {
  const tokens = StoryboardDesignTokens.baseline;
  return ThemeData(
    brightness: Brightness.dark,
    useMaterial3: true,
    scaffoldBackgroundColor: tokens.canvas,
    colorScheme: const ColorScheme.dark(
      primary: StoryboardColors.brandPrimary,
      onPrimary: Colors.black,
      surface: StoryboardColors.panel,
      onSurface: StoryboardColors.textPrimary,
      error: StoryboardColors.danger,
    ),
    extensions: const [tokens],
    textTheme: const TextTheme(
      headlineSmall: TextStyle(
        color: StoryboardColors.textPrimary,
        fontSize: 21,
        fontWeight: FontWeight.w600,
      ),
      titleMedium: TextStyle(
        color: StoryboardColors.textPrimary,
        fontSize: 17,
        fontWeight: FontWeight.w600,
      ),
      bodyMedium: TextStyle(
        color: StoryboardColors.textPrimary,
        fontSize: 14,
        height: 1.42,
      ),
      bodySmall: TextStyle(
        color: StoryboardColors.textSecondary,
        fontSize: 12,
        height: 1.4,
      ),
      labelMedium: TextStyle(
        color: StoryboardColors.textPrimary,
        fontSize: 12,
        fontWeight: FontWeight.w500,
      ),
    ),
    tooltipTheme: TooltipThemeData(
      waitDuration: const Duration(milliseconds: 350),
      decoration: BoxDecoration(
        color: const Color(0xFFF4F4F4),
        borderRadius: BorderRadius.circular(StoryboardRadii.sm),
      ),
      textStyle: const TextStyle(
        color: Colors.black,
        fontSize: 12,
        fontWeight: FontWeight.w600,
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: StoryboardColors.control,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(StoryboardRadii.md),
        borderSide: const BorderSide(color: StoryboardColors.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(StoryboardRadii.md),
        borderSide: const BorderSide(color: StoryboardColors.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(StoryboardRadii.md),
        borderSide: const BorderSide(color: StoryboardColors.brandPrimary),
      ),
    ),
  );
}
