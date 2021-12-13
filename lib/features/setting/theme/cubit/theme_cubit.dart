import 'package:hydrated_bloc/hydrated_bloc.dart';

class ThemeCubit extends HydratedCubit<bool> {
  ThemeCubit() : super(false);

  void updateTheme() => emit(!state);

  @override
  bool? fromJson(Map<String, dynamic> json) => json['theme'] as bool?;

  @override
  Map<String, dynamic>? toJson(bool state) => <String, bool>{'theme': state};
}
