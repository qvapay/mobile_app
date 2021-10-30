import 'dart:async';
import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile_app/preferences/preferences.dart';

part 'preferences_event.dart';
part 'preferences_state.dart';

const kExpireSession = 30;

class PreferencesBloc extends Bloc<PreferencesEvent, PreferencesState> {
  PreferencesBloc({required PreferencesRepository preferencesRepository})
      : _preferencesRepository = preferencesRepository,
        super(PreferencesInitial()) {
    on<GetPreferences>(_getPreferencesEvent);
    on<CleanPreferences>(_cleanPreferencesEvent);
  }

  final PreferencesRepository _preferencesRepository;

  FutureOr<void> _getPreferencesEvent(
    GetPreferences event,
    Emitter emit,
  ) async {
    final isFristTime = await _preferencesRepository.getIsFristTime();

    if (isFristTime) {
      return emit(PreferencesFristTime());
    } else {
      final lastLogIn = await _preferencesRepository.getLastLogIn();

      if (lastLogIn == null) return emit(PreferencesNotRecentStart());

      final lastDateDiffWithNow = DateTime.now().difference(lastLogIn.date);

      if (lastDateDiffWithNow.inMinutes > kExpireSession) {
        return emit(PreferencesRecentStart(lastLogIn: lastLogIn));
      } else {
        return emit(PreferencesVeryRecentStart());
      }
    }
  }

  FutureOr<void> _cleanPreferencesEvent(
    CleanPreferences event,
    Emitter<PreferencesState> emit,
  ) async {
    await _preferencesRepository.clear();
    await _preferencesRepository.setIsFristTime();
  }
}
