import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile_app/core/themes/colors.dart';
import 'package:mobile_app/features/login/login.dart';
import 'package:mobile_app/features/setting/theme/cubit/theme_cubit.dart';
import 'package:mobile_app/features/start/strings.dart';

class OnboardingView extends StatefulWidget {
  const OnboardingView({
    Key? key,
  }) : super(key: key);

  @override
  _OnboardingViewState createState() => _OnboardingViewState();
}

class _OnboardingViewState extends State<OnboardingView>
    with SingleTickerProviderStateMixin {
  final int _numDots = 3;
  late final TabController _controller;

  final bodyWidget = <int, Map<String, String>>{
    1: {
      'title': esTitle1,
      'subtitle': esSubTitle1,
      'image': 'assets/onboarding/1.png',
    },
    2: {
      'title': esTitle2,
      'subtitle': esSubTitle2,
      'image': 'assets/onboarding/2.png',
    },
    3: {
      'title': esTitle3,
      'subtitle': esSubTitle3,
      'image': 'assets/onboarding/3.png',
    },
  };

  @override
  void initState() {
    super.initState();
    _controller = TabController(length: _numDots, vsync: this);
  }

  void changeView() {
    setState(() {
      (_controller.index == _numDots - 1)
          ? goToLoginPage()
          : _controller.index++;
    });
  }

  void goToLoginPage() {
    Navigator.of(context)
        .pushAndRemoveUntil<void>(LoginPage.go(), (route) => false);
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 38, bottom: 32),
            child: Image.asset(
              context.select((ThemeCubit cubit) => cubit.state)
                  ? 'assets/onboarding/dark_logo.png'
                  : 'assets/onboarding/logo.png',
              scale: 1.5,
            ),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  bodyWidget[_controller.index + 1]!['title']!,
                  style: TextStyle(
                    fontSize: 26,
                    color: Theme.of(context).primaryColor,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(
                  height: 16,
                ),
                Text(
                  bodyWidget[_controller.index + 1]!['subtitle']!,
                  style: TextStyle(
                    fontSize: 16,
                    color: Theme.of(context)
                        .textTheme
                        .headline1
                        ?.color!
                        .withOpacity(0.35),
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Expanded(
                  child: Center(
                    child: Image.asset(
                      bodyWidget[_controller.index + 1]!['image']!,
                      width: size.width * 0.7,
                    ),
                  ),
                ),
              ],
            ),
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              TextButton(
                onPressed: _controller.index == 2 ? null : goToLoginPage,
                child: Text(
                  'Omitir',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: _controller.index == 2
                        ? AppColors.textBlue.withOpacity(0.35)
                        : null,
                  ),
                ),
              ),
              TabPageSelector(
                controller: _controller,
                color: Colors.grey[200],
                indicatorSize: 16,
                selectedColor: context.select((ThemeCubit cubit) => cubit.state)
                    ? AppColors.textBlue
                    : Colors.grey,
              ),
              TextButton(
                onPressed: changeView,
                child: const Text(
                  'Siguiente',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
