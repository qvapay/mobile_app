import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';

part 'start_event.dart';
part 'start_state.dart';

class StartBloc extends Bloc<StartEvent, StartState> {
  StartBloc() : super(StartInitial()) {
    on<StartEvent>((event, emit) {
      // TODO: implement event handler
    });
  }
}
