import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';

part 'recover_password_event.dart';
part 'recover_password_state.dart';

class RecoverPasswordBloc
    extends Bloc<RecoverPasswordEvent, RecoverPasswordState> {
  RecoverPasswordBloc() : super(RecoverPasswordInitial()) {
    on<RecoverPasswordEvent>((event, emit) {
      // TODO: implement event handler
    });
  }
}
