import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';

part 'two_factor_auth_event.dart';
part 'two_factor_auth_state.dart';

class TwoFactorAuthBloc extends Bloc<TwoFactorAuthEvent, TwoFactorAuthState> {
  TwoFactorAuthBloc() : super(TwoFactorAuthInitial()) {
    on<TwoFactorAuthEvent>((event, emit) {
      // TODO: implement event handler
    });
  }
}
