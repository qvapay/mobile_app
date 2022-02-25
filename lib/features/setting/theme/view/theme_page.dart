import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile_app/features/setting/theme/cubit/theme_cubit.dart';

class ThemePage extends StatelessWidget {
  const ThemePage({Key? key}) : super(key: key);

  /// Returns a [MaterialPageRoute] to navigate to `this` widget.
  static Route go() {
    return MaterialPageRoute<void>(builder: (_) => const ThemePage());
  }

  @override
  Widget build(BuildContext context) {
    return const ThemeView();
  }
}

class ThemeView extends StatelessWidget {
  const ThemeView({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Theme'),
      ),
      body: Center(
        child: SwitchListTile(
          value: context.select((ThemeCubit cubit) => cubit.state),
          title: const Text('Dark Mode'),
          onChanged: (value) => context.read<ThemeCubit>().updateTheme(),
        ),
      ),
    );
  }
}
