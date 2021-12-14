import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile_app/features/setting/theme/cubit/theme_cubit.dart';

class SettingPage extends StatelessWidget {
  const SettingPage({Key? key}) : super(key: key);

  static MaterialPageRoute go() => MaterialPageRoute<void>(
        builder: (BuildContext context) => const SettingPage(),
      );

  @override
  Widget build(BuildContext context) {
    return const SettingView();
  }
}

class SettingView extends StatelessWidget {
  const SettingView({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Theme.of(context).backgroundColor,
      appBar: AppBar(
        title: const Text('Setting'),
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(8),
          child: Container(
            decoration: BoxDecoration(
              border: Border.all(color: Theme.of(context).primaryColor),
            ),
            child: SwitchListTile(
              value: context.select((ThemeCubit cubit) => cubit.state),
              title: const Text('Dark Mode'),
              onChanged: (value) => context.read<ThemeCubit>().updateTheme(),
            ),
          ),
        ),
      ),
    );
  }
}
